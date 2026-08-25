import { useState, type ReactNode } from 'react'
import { chromaticNotes, DEGREE_LABELS, scaleDisplayName } from '../music/theory'
import type {
  BuiltScale,
  ChordDefinition,
  HarmonizedDegree,
  KeySelection,
  ScaleNote,
} from '../music/types'
import { currentStep, isSelfChecked } from '../practice/machine'
import {
  acceptedSignatures,
  checkChord,
  checkNoteSlots,
  checkSignature,
  emptyNoteSlots,
  expectedPitchClasses,
  noteSlotsFilled,
  TRIAD_QUALITIES,
  type NoteSlots,
} from '../practice/questions'
import type { PracticeState, StepOutcome, TriadQuality } from '../practice/types'
import { useT } from '../i18n'

const SIGNATURE_COUNTS = [0, 1, 2, 3, 4, 5, 6, 7] as const

const CHROMATIC_PITCH_CLASSES = Array.from({ length: 12 }, (_, pitchClass) => pitchClass)

/** The signature answer while it is being assembled: both halves start unset. */
interface DraftSignature {
  count: number | null
  accidental: 'sharp' | 'flat' | null
}

const EMPTY_SIGNATURE: DraftSignature = { count: null, accidental: null }

function spellingsOf(pitchClass: number): { symbols: string; solfege: string; names: string[] } {
  const notes = chromaticNotes(pitchClass)
  return {
    symbols: notes.map((note) => note.symbol).join(' / '),
    solfege: notes.map((note) => note.solfege).join(' / '),
    names: notes.map((note) => note.accessibleName),
  }
}

function ChromaticKeyboard({
  isDisabled,
  isSelected,
  onPick,
}: {
  isDisabled: (pitchClass: number) => boolean
  isSelected: (pitchClass: number) => boolean
  onPick: (pitchClass: number) => void
}) {
  const tr = useT()
  return (
    <div className="chromatic-keyboard" role="group" aria-label={tr('practice.keyboardAria')}>
      {CHROMATIC_PITCH_CLASSES.map((pitchClass) => {
        const { symbols, solfege, names } = spellingsOf(pitchClass)
        const classes = ['chromatic-key']
        if (names.length > 1) classes.push('chromatic-key--altered')
        if (isSelected(pitchClass)) classes.push('is-selected')
        return (
          <button
            type="button"
            key={pitchClass}
            className={classes.join(' ')}
            disabled={isDisabled(pitchClass)}
            aria-pressed={isSelected(pitchClass)}
            aria-label={names.join(` ${tr('practice.spellingOr')} `)}
            onClick={() => onPick(pitchClass)}
          >
            <strong>{symbols}</strong>
            {solfege !== symbols && <span>{solfege}</span>}
          </button>
        )
      })}
    </div>
  )
}

function NoteSlotRow({ slots, onClear }: { slots: NoteSlots; onClear: (index: number) => void }) {
  const tr = useT()
  return (
    <div className="note-slots" role="group" aria-label={tr('practice.slotsAria')}>
      {slots.map((slot, index) => (
        <button
          type="button"
          key={DEGREE_LABELS[index]}
          className={slot === null ? 'note-slot' : 'note-slot is-filled'}
          disabled={slot === null}
          onClick={() => onClear(index)}
          aria-label={
            slot === null
              ? tr('practice.slotEmptyAria', { degree: index + 1 })
              : tr('practice.slotFilledAria', {
                  degree: index + 1,
                  note: spellingsOf(slot).names.join(` ${tr('practice.spellingOr')} `),
                })
          }
        >
          <span className="note-slot__degree">{DEGREE_LABELS[index]}</span>
          <strong>{slot === null ? '·' : spellingsOf(slot).symbols}</strong>
        </button>
      ))}
    </div>
  )
}

function NoteAnswerRow({ slots, notes }: { slots: NoteSlots; notes: ScaleNote[] }) {
  const tr = useT()
  const results = checkNoteSlots(slots, expectedPitchClasses(notes))
  return (
    <div className="note-answers" aria-label={tr('practice.correctAnswer')}>
      {notes.map((note, index) => {
        const correct = results[index]
        const entered = slots[index]
        return (
          <div
            className={correct ? 'note-answer is-correct' : 'note-answer is-wrong'}
            key={note.degree}
          >
            <span className="note-answer__degree">{note.degreeLabel}</span>
            <strong>{note.symbol}</strong>
            {note.solfege !== note.symbol && <span>{note.solfege}</span>}
            {!correct && typeof entered === 'number' && <s>{spellingsOf(entered).symbols}</s>}
          </div>
        )
      })}
    </div>
  )
}

function SignatureQuestion({
  draft,
  onChange,
}: {
  draft: DraftSignature
  onChange: (draft: DraftSignature) => void
}) {
  const tr = useT()
  const noAccidentals = draft.count === 0
  return (
    <div className="signature-question">
      <div>
        <span className="control-label">{tr('practice.signature.count')}</span>
        <div className="practice-chips" role="group" aria-label={tr('practice.signature.count')}>
          {SIGNATURE_COUNTS.map((count) => (
            <button
              type="button"
              key={count}
              className={draft.count === count ? 'practice-chip is-active' : 'practice-chip'}
              aria-pressed={draft.count === count}
              onClick={() => onChange({ ...draft, count })}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="control-label">{tr('practice.signature.kind')}</span>
        {noAccidentals ? (
          <p className="practice-note">{tr('practice.signature.noneHint')}</p>
        ) : (
          <div className="segmented segmented--small" role="group" aria-label={tr('practice.signature.kind')}>
            <button
              type="button"
              className={draft.accidental === 'sharp' ? 'is-active' : ''}
              aria-pressed={draft.accidental === 'sharp'}
              onClick={() => onChange({ ...draft, accidental: 'sharp' })}
            >
              ♯ {tr('practice.signature.sharps')}
            </button>
            <button
              type="button"
              className={draft.accidental === 'flat' ? 'is-active' : ''}
              aria-pressed={draft.accidental === 'flat'}
              onClick={() => onChange({ ...draft, accidental: 'flat' })}
            >
              ♭ {tr('practice.signature.flats')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SignatureAnswer({ selection }: { selection: KeySelection }) {
  const tr = useT()
  const [primary, ...alternatives] = acceptedSignatures(selection)
  return (
    <div className="signature-answer">
      <span className="eyebrow">{tr('practice.correctAnswer')}</span>
      <strong>{primary?.label}</strong>
      {alternatives.length > 0 && (
        <p className="practice-note">
          {tr('practice.alsoAccepted', {
            answer: alternatives.map((signature) => signature.label).join(', '),
          })}
        </p>
      )}
    </div>
  )
}

function ChordQuestion({
  root,
  quality,
  onRootChange,
  onQualityChange,
}: {
  root: number | null
  quality: TriadQuality | null
  onRootChange: (pitchClass: number) => void
  onQualityChange: (quality: TriadQuality) => void
}) {
  const tr = useT()
  return (
    <div className="chord-question">
      <span className="control-label">{tr('practice.chord.root')}</span>
      <ChromaticKeyboard
        isDisabled={() => false}
        isSelected={(pitchClass) => pitchClass === root}
        onPick={onRootChange}
      />
      <span className="control-label">{tr('practice.chord.quality')}</span>
      <div className="practice-chips" role="group" aria-label={tr('practice.chord.quality')}>
        {TRIAD_QUALITIES.map((candidate) => (
          <button
            type="button"
            key={candidate}
            className={quality === candidate ? 'practice-chip is-active' : 'practice-chip'}
            aria-pressed={quality === candidate}
            onClick={() => onQualityChange(candidate)}
          >
            {tr(`practice.quality.${candidate}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChordAnswer({ chord }: { chord: ChordDefinition }) {
  const tr = useT()
  return (
    <div className="signature-answer">
      <span className="eyebrow">{tr('practice.correctAnswer')}</span>
      <strong>{chord.roman} · {chord.symbol}</strong>
      <p className="practice-note">
        {chord.qualityLabel} ·{' '}
        {chord.notes
          .map((note) => (note.solfege === note.symbol ? note.symbol : `${note.symbol} (${note.solfege})`))
          .join(' · ')}
      </p>
    </div>
  )
}

function PracticeSteps({ state }: { state: PracticeState }) {
  const tr = useT()
  return (
    <ol className="practice-steps" aria-label={tr('practice.stepsAria')}>
      {state.steps.map((step, index) => (
        <li
          key={step}
          className={index === state.stepIndex ? 'is-active' : index < state.stepIndex ? 'is-done' : ''}
          aria-current={index === state.stepIndex ? 'step' : undefined}
        >
          {tr(`practice.step.${step}`)}
        </li>
      ))}
    </ol>
  )
}

export interface PracticePanelProps {
  state: PracticeState
  scale: BuiltScale
  harmony: HarmonizedDegree[]
  onSpin: () => void
  onLandNeedle: () => void
  onReveal: () => void
  onAnswer: (outcome: StepOutcome) => void
  onNext: () => void
  /** The instrument's own step body — the assigned fingering, the shapes. */
  children?: ReactNode
}

export function PracticePanel({
  state,
  scale,
  harmony,
  onSpin,
  onLandNeedle,
  onReveal,
  onAnswer,
  onNext,
  children,
}: PracticePanelProps) {
  const tr = useT()
  const [signature, setSignature] = useState<DraftSignature>(EMPTY_SIGNATURE)
  const [slots, setSlots] = useState<NoteSlots>(emptyNoteSlots)
  const [chordRoot, setChordRoot] = useState<number | null>(null)
  const [chordQuality, setChordQuality] = useState<TriadQuality | null>(null)

  const step = currentStep(state)
  const { selection } = state
  const notes = scale.ascending
  const chord = harmony[state.chordDegree - 1]?.triad
  const isLastStep = state.stepIndex === state.steps.length - 1

  const resetInputs = () => {
    setSignature(EMPTY_SIGNATURE)
    setSlots(emptyNoteSlots())
    setChordRoot(null)
    setChordQuality(null)
  }

  const startRound = () => {
    resetInputs()
    onSpin()
  }

  const advance = () => {
    resetInputs()
    onNext()
    // The last step rolls straight into the next key: an extra "spin again"
    // screen between every round is pure friction.
    if (isLastStep) onSpin()
  }

  const gradeAndAdvance = (outcome: StepOutcome) => {
    onAnswer(outcome)
    advance()
  }

  const fillSlot = (pitchClass: number) => {
    setSlots((current) => {
      const index = current.indexOf(null)
      if (index === -1) return current
      return current.map((slot, position) => (position === index ? pitchClass : slot))
    })
  }

  const clearSlot = (index: number) => {
    setSlots((current) => current.map((slot, position) => (position === index ? null : slot)))
  }

  const canSubmit =
    step === 'signature'
      ? signature.count !== null && (signature.count === 0 || signature.accidental !== null)
      : step === 'chord'
        ? chordRoot !== null && chordQuality !== null
        : noteSlotsFilled(slots)

  const submit = () => {
    if (!selection || !step) return
    if (step === 'signature') {
      const isCorrect =
        signature.count !== null &&
        checkSignature(selection, {
          count: signature.count,
          accidental: signature.count === 0 ? 'natural' : signature.accidental ?? 'sharp',
        })
      onAnswer(isCorrect ? 'correct' : 'wrong')
      return
    }
    if (step === 'chord') {
      const isCorrect =
        chord !== undefined &&
        chordRoot !== null &&
        chordQuality !== null &&
        checkChord(chord, { root: chordRoot, quality: chordQuality })
      onAnswer(isCorrect ? 'correct' : 'wrong')
      return
    }
    const results = checkNoteSlots(slots, expectedPitchClasses(notes))
    onAnswer(results.every(Boolean) ? 'correct' : 'wrong')
  }

  return (
    <section className="practice-panel" aria-labelledby="practice-heading">
      <div className="practice-bar">
        <div>
          <span className="eyebrow">{tr('practice.eyebrow')}</span>
          <h3 id="practice-heading">
            {state.round > 0 ? tr('practice.round', { n: state.round }) : tr('practice.notStarted')}
          </h3>
        </div>
        <dl className="practice-tally" aria-label={tr('practice.tallyAria')}>
          <div>
            <dt>{tr('practice.verdict.correct')}</dt>
            <dd>{state.tally.correct}</dd>
          </div>
          <div>
            <dt>{tr('practice.verdict.wrong')}</dt>
            <dd>{state.tally.wrong}</dd>
          </div>
          <div>
            <dt>{tr('practice.verdict.skipped')}</dt>
            <dd>{state.tally.skipped}</dd>
          </div>
        </dl>
      </div>

      {state.phase === 'idle' && (
        <div className="practice-launch">
          <p>{tr('practice.intro')}</p>
          <button type="button" className="primary-button" onClick={startRound}>
            {tr('practice.start')}
          </button>
        </div>
      )}

      {state.phase === 'spinning' && (
        <div className="practice-launch">
          <p className="practice-spinning">{tr('practice.spinning')}</p>
          <button type="button" className="secondary-button" onClick={onLandNeedle}>
            {tr('practice.skipSpin')}
          </button>
        </div>
      )}

      {(state.phase === 'answering' || state.phase === 'revealed') && selection && step && (
        <>
          <PracticeSteps state={state} />
          <p className="practice-task">
            {tr(`practice.task.${step}`, {
              key: scaleDisplayName(scale),
              degree: DEGREE_LABELS[state.chordDegree - 1] ?? state.chordDegree,
            })}
          </p>

          {state.phase === 'answering' ? (
            <>
              {step === 'signature' && (
                <SignatureQuestion draft={signature} onChange={setSignature} />
              )}
              {step === 'notes' && (
                <div className="notes-question">
                  <NoteSlotRow slots={slots} onClear={clearSlot} />
                  <p className="practice-note">
                    {tr('practice.slotsFilled', {
                      n: slots.filter((slot) => slot !== null).length,
                      total: slots.length,
                    })}
                  </p>
                  <ChromaticKeyboard
                    isDisabled={(pitchClass) =>
                      slots.includes(pitchClass) || noteSlotsFilled(slots)
                    }
                    isSelected={() => false}
                    onPick={fillSlot}
                  />
                </div>
              )}
              {step === 'chord' && (
                <ChordQuestion
                  root={chordRoot}
                  quality={chordQuality}
                  onRootChange={setChordRoot}
                  onQualityChange={setChordQuality}
                />
              )}
              {/* The fretboard step is played, not answered: the instrument
                  shows the assignment and the player reports back. */}
              {step === 'scale' && children}
              <div className="practice-actions">
                {step === 'scale' ? (
                  <button type="button" className="primary-button" onClick={onReveal}>
                    {tr('practice.played')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!canSubmit}
                      onClick={submit}
                    >
                      {tr('practice.check')}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onAnswer('skipped')}
                    >
                      {tr('practice.reveal')}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              {state.outcome !== null && (
                <p className={`practice-verdict practice-verdict--${state.outcome}`}>
                  {tr(`practice.verdict.${state.outcome}`)}
                </p>
              )}
              {step === 'signature' && <SignatureAnswer selection={selection} />}
              {/* A correct answer needs no correction table: the regular
                  "seven degrees" strip renders right below with the same notes. */}
              {step === 'notes' && state.outcome !== 'correct' && (
                <NoteAnswerRow slots={slots} notes={notes} />
              )}
              {/* Same rule as the notes step: a correct answer is already
                  spelled out by the chord view that follows. */}
              {step === 'chord' && chord && state.outcome !== 'correct' && (
                <ChordAnswer chord={chord} />
              )}
              {children}
              <div className="practice-actions">
                {isSelfChecked(step) && state.outcome === null ? (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => gradeAndAdvance('correct')}
                    >
                      {tr('practice.selfCheck.ok')}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => gradeAndAdvance('wrong')}
                    >
                      {tr('practice.selfCheck.fail')}
                    </button>
                  </>
                ) : (
                  <button type="button" className="primary-button" onClick={advance}>
                    {isLastStep ? tr('practice.nextRound') : tr('practice.next')}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
