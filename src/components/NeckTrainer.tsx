import {
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { FretLocation, PlayableEvent } from '../instruments/types'
import { formatOpenString, type GuitarConfig } from '../instruments/guitar'
import type { NeckTrainerProps } from '../instruments/uiRegistry'
import { chromaticNotes, formatPitchClass, mod, pluralizeRu, spellingsOf } from '../music/theory'
import { initialNeckState, NECK_SERIES, neckReducer, summarize } from '../practice/neck/machine'
import {
  availableSpans,
  defaultZone,
  isNeckZone,
  normalizeZone,
  NOTE_POOLS,
  spanFrets,
  zoneCards,
} from '../practice/neck/zone'
import type {
  FretSpan,
  NeckCard,
  NeckCell,
  NeckPhase,
  NeckState,
  NeckZone,
} from '../practice/neck/types'
import { useFrettedPreferences } from '../hooks/useFrettedPreferences'
import { useNoteListener, type NoteListener } from '../hooks/useNoteListener'
import { usePersistentState } from '../hooks/usePersistentState'
import { useSynth } from '../hooks/useSynth'
import { useLang, useT, type Lang } from '../i18n'
import { Fretboard, type FretTone } from './Fretboard'
import { GuitarSettings } from './GuitarSettings'

/** How long a solved card stays up before the next one takes its place. */
const ADVANCE_MS = 900
/** The pause between a passed sound check and the first card. */
const FIRST_CARD_MS = 1300
/** Without a single recognised note for this long, the session pauses. */
const PAUSE_MS = 30_000
/** How long the sound check waits before saying what usually helps. */
const NAG_MS = 9_000
/** Past this many frets off, "two frets down" stops being a useful direction. */
const NEAR_MISS = 6

const HINT_KEYS: readonly string[] = [' ', 'ArrowLeft', 'PageUp']
const SKIP_KEYS: readonly string[] = ['ArrowRight', 'PageDown']

/** Two quick high notes — over before the hand has left the string. */
const CHIME: PlayableEvent[] = [
  { midi: 88, startBeat: 0, durationBeats: 0.3 },
  { midi: 95, startBeat: 0.22, durationBeats: 0.5 },
]
const CHIME_TEMPO = 150
/** The chime comes out of speakers that share a room with the microphone. */
const CHIME_MUTE_MS = 550

interface NeckOptions {
  hintSeconds: number
  chime: boolean
}

const HINT_CHOICES: readonly number[] = [5, 8, 12]
const DEFAULT_OPTIONS: NeckOptions = { hintSeconds: 8, chime: true }

function isNeckOptions(value: unknown): value is NeckOptions {
  if (typeof value !== 'object' || value === null) return false
  const options = value as Record<string, unknown>
  return HINT_CHOICES.includes(options.hintSeconds as number) && typeof options.chime === 'boolean'
}

const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`

/** Seconds to one decimal, with the decimal mark the language writes. */
const seconds = (value: number, lang: Lang) =>
  value.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

function cellLocation(cell: NeckCell): FretLocation | null {
  const note = chromaticNotes(mod(cell.midi))[0]
  if (!note) return null
  return {
    kind: 'fret',
    id: `s${cell.stringIndex}-f${cell.fret}`,
    stringIndex: cell.stringIndex,
    fret: cell.fret,
    midi: cell.midi,
    pitchClass: note.pitchClass,
    // Not a scale degree: a mark on the neck belongs to no key.
    degree: 0,
    note: { ...note, degree: 0, interval: 0, degreeLabel: '' },
  }
}

function fretsWord(count: number, lang: Lang, tr: ReturnType<typeof useT>): string {
  if (lang === 'en') return tr(count === 1 ? 'neck.fret.one' : 'neck.fret.many')
  return pluralizeRu(count, tr('neck.fret.one'), tr('neck.fret.few'), tr('neck.fret.many'))
}

function spanLabel(span: FretSpan, frets: number, tr: ReturnType<typeof useT>): string {
  if (span === 'all') return tr('neck.zone.allFrets')
  const { from, to } = spanFrets(span, frets)
  return `${from}–${to}`
}

interface ZoneControlsProps {
  config: GuitarConfig
  zone: NeckZone
  onZoneChange: (zone: NeckZone) => void
  options: NeckOptions
  onOptionsChange: (options: NeckOptions) => void
}

/**
 * What to practise today. Every control works mid-session too: a zone is a
 * decision about the next card, not about the ones already played.
 */
function ZoneControls({ config, zone, onZoneChange, options, onOptionsChange }: ZoneControlsProps) {
  const tr = useT()
  const stringCount = config.strings.length

  const toggleString = (stringIndex: number) => {
    const next = zone.strings.includes(stringIndex)
      ? zone.strings.filter((candidate) => candidate !== stringIndex)
      : [...zone.strings, stringIndex]
    // A drill needs at least one string: the last one cannot be switched off.
    if (next.length > 0) onZoneChange({ ...zone, strings: next.sort((a, b) => a - b) })
  }

  return (
    <div className="neck-zone">
      <div className="neck-zone__row">
        <span className="control-label">{tr('neck.zone.strings')}</span>
        {/* Thickest first, the way a tuning is spelled: E A D G B E. */}
        <div className="practice-chips" role="group" aria-label={tr('neck.zone.strings')}>
          {config.strings.map((open, stringIndex) => {
            const active = zone.strings.includes(stringIndex)
            const note = formatPitchClass(mod(open), 'sharp')
            return (
              <button
                type="button"
                key={stringIndex}
                className={active ? 'practice-chip is-active' : 'practice-chip'}
                aria-pressed={active}
                aria-label={tr('neck.zone.stringAria', { n: stringCount - stringIndex, note })}
                onClick={() => toggleString(stringIndex)}
              >
                {stringCount - stringIndex} · {note}
              </button>
            )
          })}
        </div>
      </div>

      <div className="neck-zone__row">
        <span className="control-label">{tr('neck.zone.frets')}</span>
        <div className="segmented segmented--small" role="group" aria-label={tr('neck.zone.frets')}>
          {availableSpans(config.frets).map((span) => (
            <button
              type="button"
              key={span}
              className={zone.span === span ? 'is-active' : ''}
              aria-pressed={zone.span === span}
              onClick={() => onZoneChange({ ...zone, span })}
            >
              {spanLabel(span, config.frets, tr)}
            </button>
          ))}
        </div>

        <span className="control-label">{tr('neck.zone.notes')}</span>
        <div className="segmented segmented--small" role="group" aria-label={tr('neck.zone.notes')}>
          {NOTE_POOLS.map((pool) => (
            <button
              type="button"
              key={pool}
              className={zone.pool === pool ? 'is-active' : ''}
              aria-pressed={zone.pool === pool}
              onClick={() => onZoneChange({ ...zone, pool })}
            >
              {tr(`neck.zone.${pool}`)}
            </button>
          ))}
        </div>

        <span className="control-label">{tr('neck.hintAfter')}</span>
        <div className="segmented segmented--small" role="group" aria-label={tr('neck.hintAfter')}>
          {HINT_CHOICES.map((hintSeconds) => (
            <button
              type="button"
              key={hintSeconds}
              className={options.hintSeconds === hintSeconds ? 'is-active' : ''}
              aria-pressed={options.hintSeconds === hintSeconds}
              onClick={() => onOptionsChange({ ...options, hintSeconds })}
            >
              {tr('neck.seconds', { n: hintSeconds })}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={options.chime ? 'view-toggle is-active' : 'view-toggle'}
          aria-pressed={options.chime}
          onClick={() => onOptionsChange({ ...options, chime: !options.chime })}
        >
          {tr('neck.chime')}
        </button>
      </div>
    </div>
  )
}

/**
 * What the microphone hears right now. It is the one diagnostic a player
 * needs: is anything arriving, is it above the room, does it have a pitch.
 */
function ListenerMeter({ listener }: { listener: NoteListener }) {
  const tr = useT()
  const { subscribeMeter, readMeter, inputs, inputId, selectInput } = listener
  const reading = useSyncExternalStore(subscribeMeter, readMeter, readMeter)
  const position = (db: number) => `${Math.max(0, Math.min(100, ((db + 70) / 70) * 100))}%`
  const text = !reading.sounding
    ? tr('neck.meter.silence')
    : reading.heard
      ? tr('neck.meter.hears', {
          note: formatOpenString(reading.heard.midi),
          cents: signed(reading.heard.cents),
        })
      : tr('neck.meter.noise')

  return (
    // Ten updates a second would bury a screen reader; the panel around this
    // is a live region, so the meter opts out.
    <div className="neck-meter" aria-live="off">
      <div className="neck-meter__bar" aria-hidden="true">
        <i className="neck-meter__level" style={{ width: position(reading.level) }} />
        <i className="neck-meter__gate" style={{ left: position(reading.gate) }} />
      </div>
      <span className="neck-meter__text" aria-label={tr('neck.meter.aria')}>
        {text}
      </span>
      {inputs.length > 1 && (
        <label className="neck-meter__input">
          <span>{tr('neck.input')}</span>
          <select value={inputId ?? ''} onChange={(event) => selectInput(event.target.value)}>
            {inputs.map((input, index) => (
              <option key={input.deviceId} value={input.deviceId}>
                {input.label || tr('neck.inputDefault', { n: index + 1 })}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

interface Mark {
  cell: NeckCell
  tone?: FretTone
}

/** What the stage says and shows for the state the session is in. */
interface StageView {
  heading: string
  prompt: ReactNode
  promptAria?: string
  sub: string
  feedback: string
  tone?: FretTone
  marks: Mark[]
}

interface SessionProps {
  instrumentId: string
  config: GuitarConfig
  volume: number
  seed: number
}

function NeckSession({ instrumentId, config, volume, seed }: SessionProps) {
  const tr = useT()
  const lang = useLang()
  const stringCount = config.strings.length
  // One zone per string count: "strings 6 and 5" on a six-string are not the
  // two lowest strings of a seven-string, so the choice does not carry over.
  const [savedZone, setSavedZone] = usePersistentState<NeckZone>(
    `qfc.neck.zone.${instrumentId}.${stringCount}.v1`,
    defaultZone(stringCount),
    isNeckZone,
  )
  const [options, setOptions] = usePersistentState<NeckOptions>(
    'qfc.neck.options.v1',
    DEFAULT_OPTIONS,
    isNeckOptions,
  )
  const zone = useMemo(
    () => normalizeZone(savedZone, stringCount, config.frets),
    [config.frets, savedZone, stringCount],
  )
  const cards = useMemo(
    () => zoneCards(config.strings, config.frets, zone),
    [config.frets, config.strings, zone],
  )
  const [state, dispatch] = useReducer(neckReducer, seed, initialNeckState)
  const listener = useNoteListener()
  const { status, onNote, mute } = listener
  const { playEvents, playMidi } = useSynth()
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // A microphone that dropped out mid-session leaves the round where it was;
  // what is on screen follows the microphone.
  const phase: NeckPhase = status === 'listening' ? state.phase : 'idle'

  const changeZone = (next: NeckZone) => {
    setSavedZone(next)
    dispatch({
      type: 'zone',
      pool: zoneCards(config.strings, config.frets, next),
      at: performance.now(),
    })
  }

  const start = async () => {
    // Off the button: a pedal or the space bar must not press it a second time.
    sectionRef.current?.focus({ preventScroll: true })
    dispatch({ type: 'stop' })
    const listening = await listener.start({
      lowestMidi: Math.min(...config.strings),
      highestMidi: Math.max(...config.strings) + config.frets,
    })
    if (!listening) return
    dispatch({
      type: 'begin',
      pool: cards,
      openStrings: config.strings,
      frets: config.frets,
      at: performance.now(),
    })
  }

  const stop = () => {
    listener.stop()
    dispatch({ type: 'stop' })
  }

  useEffect(
    () => onNote((note) => dispatch({ type: 'heard', midi: note.midi, at: note.at })),
    [onNote],
  )

  // From here on the hands are on the instrument: the card and the neck under
  // it have to be on screen without anyone scrolling to them.
  useEffect(() => {
    if (phase === 'check') stageRef.current?.scrollIntoView({ block: 'start' })
  }, [phase])

  useEffect(() => {
    if (phase !== 'check' || state.checkNagged) return
    const timer = window.setTimeout(() => dispatch({ type: 'nag' }), NAG_MS)
    return () => window.clearTimeout(timer)
  }, [phase, state.checkNagged])

  useEffect(() => {
    if (phase !== 'asking' || state.revealed) return
    const timer = window.setTimeout(
      () => dispatch({ type: 'hintDue' }),
      options.hintSeconds * 1000,
    )
    return () => window.clearTimeout(timer)
    // `shownAt` moves with every card and every resume: the wait starts over.
  }, [options.hintSeconds, phase, state.revealed, state.shownAt])

  useEffect(() => {
    if (phase !== 'asking') return
    const timer = window.setTimeout(() => dispatch({ type: 'idle' }), PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [phase, state.activeAt])

  useEffect(() => {
    if (phase !== 'ready' && phase !== 'solved') return
    const timer = window.setTimeout(
      () => dispatch({ type: 'advance', at: performance.now() }),
      phase === 'ready' ? FIRST_CARD_MS : ADVANCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [phase, state.position])

  const chime = useEffectEvent(() => {
    if (!options.chime) return
    mute(CHIME_MUTE_MS)
    playEvents(CHIME, CHIME_TEMPO, volume)
  })
  useEffect(() => {
    if (phase === 'ready' || phase === 'solved') chime()
  }, [phase, state.position])

  useEffect(() => {
    if (phase !== 'asking') return
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof Element && target.closest('input, select, textarea, [role="dialog"]')) {
        return
      }
      if (HINT_KEYS.includes(event.key)) {
        event.preventDefault()
        dispatch({ type: 'hintDue' })
      } else if (SKIP_KEYS.includes(event.key)) {
        event.preventDefault()
        dispatch({ type: 'skip', at: performance.now() })
      }
    }
    // Capture, so the key never reaches a focused chip and toggles a string.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phase])

  const view = stageView({ phase, state, config, cards, lang, tr })
  const tones = new Map<string, FretTone | undefined>()
  const locations = view.marks.flatMap((mark) => {
    const location = cellLocation(mark.cell)
    if (!location) return []
    tones.set(location.id, mark.tone)
    return [location]
  })
  // The mark the player is meant to look at: what they played wrong, else the
  // answer.
  const focus = locations.find((location) => tones.get(location.id) === 'wrong') ?? locations[0]
  const { from, to } = spanFrets(zone.span, config.frets)
  const mutedStrings = config.strings
    .map((_, stringIndex) => stringIndex)
    .filter((stringIndex) => !zone.strings.includes(stringIndex))

  return (
    <section
      className="neck-trainer"
      aria-labelledby="neck-heading"
      ref={sectionRef}
      tabIndex={-1}
    >
      <div className="practice-bar">
        <div>
          <span className="eyebrow">{tr('neck.eyebrow')}</span>
          <h3 id="neck-heading">{view.heading}</h3>
        </div>
        <dl className="practice-tally" aria-label={tr('practice.tallyAria')}>
          {(['correct', 'corrected', 'revealed'] as const).map((outcome) => (
            <div key={outcome}>
              <dt>{tr(`neck.tally.${outcome}`)}</dt>
              <dd>{phase === 'idle' ? 0 : state.tally[outcome]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ZoneControls
        config={config}
        zone={zone}
        onZoneChange={changeZone}
        options={options}
        onOptionsChange={setOptions}
      />

      {phase === 'idle' ? (
        <div className="practice-launch">
          <p>{tr('neck.intro')}</p>
          {(status === 'denied' || status === 'unsupported' || status === 'failed') && (
            <div className="error-callout" role="alert">
              {tr(`neck.mic.${status}`)}
            </div>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={status === 'starting'}
            onClick={() => void start()}
          >
            {status === 'starting' ? tr('neck.mic.starting') : tr('neck.start')}
          </button>
          <p className="practice-note">{tr('neck.privacy')}</p>
        </div>
      ) : (
        <div className="neck-stage" data-tone={view.tone} ref={stageRef}>
          <p className="neck-prompt" aria-label={view.promptAria}>
            {view.prompt}
          </p>
          <p className="neck-sub">{view.sub}</p>
          <p className="neck-feedback">{view.feedback}</p>
        </div>
      )}

      <div className="neck-board">
        <Fretboard
          config={config}
          locations={locations}
          labelMode="notes"
          // A click plays the note through the speakers, and the microphone
          // must not take that for an answer.
          onPlayNote={(midi) => {
            mute(1200)
            playMidi(midi, volume)
          }}
          viewport={zone.span === 'all' ? undefined : { fromFret: from, toFret: to }}
          markTone={(location) => tones.get(location.id)}
          mutedStrings={mutedStrings}
          scrollToLocationId={phase === 'idle' ? null : (focus?.id ?? null)}
        />
      </div>

      {phase !== 'idle' && (
        <div className="neck-footer">
          <ListenerMeter listener={listener} />
          <span className="practice-note">{tr('neck.keys')}</span>
          <button type="button" className="secondary-button" onClick={stop}>
            {tr('neck.stop')}
          </button>
        </div>
      )}
    </section>
  )
}

interface StageInput {
  phase: NeckPhase
  state: NeckState
  config: GuitarConfig
  cards: NeckCard[]
  lang: Lang
  tr: ReturnType<typeof useT>
}

function stageView({ phase, state, config, cards, lang, tr }: StageInput): StageView {
  const stringCount = config.strings.length
  const lowest = config.strings[0] ?? 0
  const openLowest: NeckCell = { stringIndex: 0, fret: 0, midi: lowest }

  if (phase === 'idle') {
    // Before the session the neck is a map of what is about to be asked.
    return {
      heading: tr('neck.title.idle'),
      prompt: null,
      sub: '',
      feedback: '',
      marks: cards.flatMap((card) => card.answers.map((cell) => ({ cell }))),
    }
  }

  if (phase === 'check' || phase === 'ready') {
    const expected = formatOpenString(lowest)
    const heard = state.checkHeard === null ? null : formatOpenString(state.checkHeard)
    let feedback = tr(state.checkNagged ? 'neck.check.nag' : 'neck.check.task')
    if (phase === 'ready') {
      feedback =
        state.transpose === 0
          ? tr('neck.ready', { note: heard ?? expected })
          : tr('neck.ready.shifted', { note: heard ?? expected, shift: signed(state.transpose) })
    } else if (state.checkHeard !== null && heard !== null) {
      const near = Math.abs(state.checkHeard - lowest) <= 4
      feedback = tr(near ? 'neck.check.near' : 'neck.check.far', {
        heard,
        expected,
        n: stringCount,
      })
    }
    return {
      heading: tr('neck.title.check'),
      prompt: <strong>{formatPitchClass(mod(lowest), 'sharp')}</strong>,
      sub: tr('neck.openString', { n: stringCount }),
      feedback,
      tone: phase === 'ready' ? 'correct' : state.checkHeard !== null ? 'wrong' : undefined,
      marks: [{ cell: openLowest, tone: phase === 'ready' ? 'correct' : 'hint' }],
    }
  }

  if (phase === 'summary') {
    const summary = summarize(state.attempts)
    return {
      heading: tr('neck.title.summary'),
      prompt: (
        <>
          <strong>{summary.clean}</strong>
          <span>/ {summary.total}</span>
        </>
      ),
      promptAria: tr('neck.summary.aria', { clean: summary.clean, total: summary.total }),
      sub:
        summary.meanSeconds === null
          ? ''
          : tr('neck.summary.mean', { s: seconds(summary.meanSeconds, lang) }),
      feedback: tr('neck.summary.next'),
      // What did not come out first time, left on the neck to look at.
      marks: state.attempts
        .filter((attempt) => attempt.outcome !== 'correct')
        .flatMap((attempt) => attempt.card.answers.map((cell) => ({ cell, tone: 'wrong' as const }))),
    }
  }

  const { card, verdict } = state
  if (!card) return { heading: '', prompt: null, sub: '', feedback: '', marks: [] }

  const spelling = spellingsOf(card.pitchClass)
  const [symbol, alternative] = spelling.symbols.split(' / ')
  const hints: Mark[] = card.answers.map((cell) => ({ cell, tone: 'hint' }))
  const view: StageView = {
    heading: tr('neck.title.card', { n: state.position, total: NECK_SERIES }),
    prompt: (
      <>
        <strong>{symbol}</strong>
        {alternative && <span>/ {alternative}</span>}
        {spelling.solfege !== spelling.symbols && <small>{spelling.solfege}</small>}
      </>
    ),
    promptAria: spelling.names.join(` ${tr('practice.spellingOr')} `),
    sub: tr('neck.string', { n: stringCount - card.stringIndex }),
    feedback: tr('neck.ask'),
    marks: state.revealed ? hints : [],
  }

  if (phase === 'paused') return { ...view, feedback: tr('neck.paused'), tone: 'hint' }

  if (phase === 'solved' && verdict?.kind === 'correct') {
    const took = state.attempts.at(-1)?.seconds ?? 0
    return {
      ...view,
      feedback: tr('neck.correct', { s: seconds(took, lang) }),
      tone: 'correct',
      marks: [{ cell: verdict.cell, tone: 'correct' }],
    }
  }

  if (verdict?.kind === 'octave') {
    return {
      ...view,
      feedback: tr('neck.octave', { note: formatOpenString(verdict.midi) }),
      tone: 'wrong',
    }
  }

  if (verdict?.kind === 'wrong') {
    const off = Math.abs(verdict.semitones)
    const note = formatOpenString(verdict.midi)
    return {
      ...view,
      feedback:
        off > NEAR_MISS
          ? tr('neck.wrong.other', { note })
          : tr(verdict.semitones > 0 ? 'neck.wrong.lower' : 'neck.wrong.higher', {
              note,
              n: off,
              frets: fretsWord(off, lang, tr),
            }),
      tone: 'wrong',
      marks: [...view.marks, ...(verdict.cell ? [{ cell: verdict.cell, tone: 'wrong' as const }] : [])],
    }
  }

  if (state.revealed) {
    const where = card.answers
      .map((cell) => (cell.fret === 0 ? tr('neck.hint.open') : tr('neck.hint.fret', { n: cell.fret })))
      .join(` ${tr('practice.spellingOr')} `)
    return { ...view, feedback: tr('neck.hint', { where }), tone: 'hint' }
  }

  return view
}

/**
 * The hands-free neck drill for a fretted instrument: the question is a note
 * on a string, the answer is that note played into the microphone.
 */
export function NeckTrainer({ instrumentId, seed, settingsOpen, onCloseSettings }: NeckTrainerProps) {
  const { spec, preferences, setPreferences } = useFrettedPreferences(instrumentId)
  const { config } = preferences

  return (
    <>
      <NeckSession
        // A retuned or restrung instrument is a different neck: the session
        // and its microphone start over.
        key={`${config.strings.join('-')}:${config.frets}`}
        instrumentId={instrumentId}
        config={config}
        volume={preferences.volume}
        seed={seed}
      />
      {settingsOpen && (
        <GuitarSettings
          preferences={preferences}
          onChange={setPreferences}
          onClose={onCloseSettings}
          presets={spec.presets}
          stringCounts={spec.stringCounts}
          defaultPreferences={spec.defaultPreferences}
        />
      )}
    </>
  )
}
