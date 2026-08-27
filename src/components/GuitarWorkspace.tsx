import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  FretLocation,
  GuitarScaleFamily,
  PatternRoute,
  PerformancePattern,
  PlayableEvent,
} from '../instruments/types'
import {
  generateGuitarPatterns,
  generatePentatonicBoxPatterns,
  groupScalePatternsForDisplay,
  guitarSpec,
  hasCagedTopology,
  locateScaleOnFretboard,
  rankScalePatterns,
  scaleGenerationOptions,
  voicingToEvents,
  type BassFilter,
  type GuitarPreferences,
  type GuitarVoicing,
  type ScalePatternDisplayGroup,
  type VoicingConstraints,
} from '../instruments/guitar'
import { getFrettedSpec } from '../instruments/fretted'
import {
  buildPentatonic,
  defaultFlavor,
  pentatonicDisplayName,
  type PentatonicScale,
} from '../music/pentatonic'
import { keyDisplayName } from '../music/theory'
import type { InstrumentWorkspaceProps } from '../instruments/uiRegistry'
import type { ChordDefinition, ScaleDirection, ScaleNote } from '../music/types'
import { ascendingScaleMidis, midiNearMiddleC } from '../music/playback'
import { usePersistentState } from '../hooks/usePersistentState'
import { useSynth } from '../hooks/useSynth'
import { useVoicings } from '../hooks/useVoicings'
import { Fretboard } from './Fretboard'
import { Tablature } from './Tablature'
import { ChordDiagram } from './ChordDiagram'
import { GuitarSettings } from './GuitarSettings'
import { t, useLang, useT } from '../i18n'

type PatternFamilyChoice = 'recommended' | GuitarScaleFamily

const SCALE_FAMILY_IDS: PatternFamilyChoice[] = [
  'recommended', 'caged', 'position', '3nps', 'one-octave', 'two-octave', 'extended',
]

// CAGED / 3NPS are the same in both languages; the rest come from the dictionary.
function familyLabel(id: string): string {
  if (id === 'caged') return 'CAGED'
  if (id === '3nps') return '3NPS'
  return t(`ws.families.${id}`)
}

function scalePlaybackEvents(notes: ScaleNote[], direction: ScaleDirection): PlayableEvent[] {
  if (notes.length === 0) return []
  const ascendingMidis = ascendingScaleMidis(notes)
  ascendingMidis.push((ascendingMidis[0] ?? 60) + 12)
  const ordered = direction === 'ascending' ? ascendingMidis : [...ascendingMidis].reverse()
  return ordered.map((midi, index) => ({
    midi,
    startBeat: index * 0.55,
    durationBeats: 0.48,
  }))
}

interface RankedScaleGroups {
  options: ReturnType<typeof scaleGenerationOptions>
  ranked: PerformancePattern<FretLocation>[]
  /** The "best" list: recommended shapes first, padded to a usable length. */
  recommended: ScalePatternDisplayGroup[]
}

function rankedScaleGroups(
  patterns: PerformancePattern<FretLocation>[],
  preferences: GuitarPreferences,
): RankedScaleGroups {
  const options = scaleGenerationOptions(preferences)
  const ranked = rankScalePatterns(patterns, options)
  const groups = groupScalePatternsForDisplay(ranked)
  const target = Math.max(6, ranked.filter((pattern) => pattern.recommended).length)
  const recommended = [
    ...groups.filter((group) => group.pattern.recommended),
    ...groups.filter((group) => !group.pattern.recommended),
  ].slice(0, target)
  return { options, ranked, recommended }
}

function routesOf(pattern: PerformancePattern<FretLocation>, fallbackName: string): PatternRoute[] {
  if (pattern.routes && pattern.routes.length > 0) return pattern.routes
  return [{
    id: 'legacy',
    name: fallbackName,
    kind: 'modal',
    ascending: pattern.ascending,
    descending: pattern.descending,
  }]
}

interface PatternPlayback {
  activeLocationId: string | null
  activeStepIndex: number | null
  play: (events: PlayableEvent[]) => void
  clear: () => void
}

/** Walks the highlight along the fretboard and the tab while a route plays. */
function usePatternPlayback(
  tempo: number,
  playEvents: (events: PlayableEvent[]) => void,
): PatternPlayback {
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null)
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null)
  const timers = useRef<number[]>([])

  const clear = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
    setActiveLocationId(null)
    setActiveStepIndex(null)
  }, [])

  const play = useCallback(
    (events: PlayableEvent[]) => {
      clear()
      playEvents(events)
      const beatDurationMs = 60_000 / tempo
      events.forEach((event, index) => {
        timers.current.push(
          window.setTimeout(() => {
            setActiveLocationId(event.locationId ?? null)
            setActiveStepIndex(index)
          }, event.startBeat * beatDurationMs),
        )
      })
      const finalBeat = events.reduce(
        (latest, event) => Math.max(latest, event.startBeat + event.durationBeats),
        0,
      )
      timers.current.push(
        window.setTimeout(() => {
          setActiveLocationId(null)
          setActiveStepIndex(null)
        }, finalBeat * beatDurationMs + 80),
      )
    },
    [clear, playEvents, tempo],
  )

  return { activeLocationId, activeStepIndex, play, clear }
}

function AudioButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="audio-button" onClick={onClick} disabled={disabled}>
      <span aria-hidden="true">▶</span>
      {label}
    </button>
  )
}

function LabelModeToggle({
  preferences,
  onChange,
}: {
  preferences: GuitarPreferences
  onChange: (preferences: GuitarPreferences) => void
}) {
  const tr = useT()
  return (
    <div className="segmented segmented--small" aria-label={tr('ws.labelsAria')}>
      <button
        type="button"
        className={preferences.fretboardLabels === 'notes' ? 'is-active' : ''}
        onClick={() => onChange({ ...preferences, fretboardLabels: 'notes' })}
      >
        {tr('ws.notes')}
      </button>
      <button
        type="button"
        className={preferences.fretboardLabels === 'degrees' ? 'is-active' : ''}
        onClick={() => onChange({ ...preferences, fretboardLabels: 'degrees' })}
      >
        {tr('ws.degrees')}
      </button>
    </div>
  )
}

interface FullNeckProps {
  locations: FretLocation[]
  preferences: GuitarPreferences
  onPreferencesChange: (preferences: GuitarPreferences) => void
  playMidi: (midi: number) => void
  /** Practice puts its own caption on the disclosure that wraps this. */
  withHeading?: boolean
}

/** Every scale note across the whole neck. */
function FullNeck({
  locations,
  preferences,
  onPreferencesChange,
  playMidi,
  withHeading = true,
}: FullNeckProps) {
  const tr = useT()
  return (
    <>
      {withHeading ? (
        <div className="subsection-heading">
          <div>
            <h4>{tr('ws.allNotes')}</h4>
            <p>{tr('ws.allNotesHint')}</p>
          </div>
          <LabelModeToggle preferences={preferences} onChange={onPreferencesChange} />
        </div>
      ) : (
        <div className="full-neck-toolbar">
          <p>{tr('ws.allNotesHint')}</p>
          <LabelModeToggle preferences={preferences} onChange={onPreferencesChange} />
        </div>
      )}
      <Fretboard
        config={preferences.config}
        locations={locations}
        labelMode={preferences.fretboardLabels}
        onPlayNote={playMidi}
      />
      <div className="fretboard-legend" aria-label={tr('ws.fretboardLegendAria')}>
        <span><i className="legend-dot legend-dot--root" /> {tr('ws.tonic')}</span>
        <span><i className="legend-dot" /> {tr('ws.scaleNotes')}</span>
        <span>{tr('ws.fullRange', { frets: preferences.config.frets })}</span>
      </div>
    </>
  )
}

interface NotesViewProps {
  activeNotes: ScaleNote[]
  locations: FretLocation[]
  preferences: GuitarPreferences
  onPreferencesChange: (preferences: GuitarPreferences) => void
  playMidi: (midi: number) => void
  playScale: (direction: ScaleDirection) => void
  /** Practice moves the whole neck onto the fretboard step, behind a click. */
  showFullNeck?: boolean
}

function NotesView({
  activeNotes,
  locations,
  preferences,
  onPreferencesChange,
  playMidi,
  playScale,
  showFullNeck = true,
}: NotesViewProps) {
  const tr = useT()
  const noteMidis = ascendingScaleMidis(activeNotes)

  return (
    <section className="workspace-section" aria-labelledby="notes-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tr('ws.scaleContent')}</span>
          <h3 id="notes-heading">{tr('ws.sevenDegrees')}</h3>
        </div>
        {/* Both directions are always on offer. Tying playback to the ↑/↓ of
            the melodic minor left every other key stuck on whichever one was
            picked there, with no control in sight to put it back. */}
        <div className="play-pair">
          <AudioButton label={tr('ws.playUp')} onClick={() => playScale('ascending')} />
          <AudioButton label={tr('ws.playDown')} onClick={() => playScale('descending')} />
        </div>
      </div>

      <div className="note-strip">
        {activeNotes.map((note, index) => (
          <button
            type="button"
            className={note.degree === 1 ? 'note-card is-root' : 'note-card'}
            key={`${note.symbol}-${note.degree}`}
            onClick={() => playMidi(noteMidis[index] ?? midiNearMiddleC(note.pitchClass))}
            aria-label={tr('ws.degreeNoteAria', { degree: note.degree, note: note.accessibleName })}
          >
            <span className="note-card__degree">{note.degreeLabel}</span>
            <strong>{note.symbol}</strong>
            <span>{note.solfege}</span>
          </button>
        ))}
      </div>

      {showFullNeck && (
        <FullNeck
          locations={locations}
          preferences={preferences}
          onPreferencesChange={onPreferencesChange}
          playMidi={playMidi}
        />
      )}
    </section>
  )
}

interface ScalesViewProps {
  patterns: PerformancePattern<FretLocation>[]
  preferences: GuitarPreferences
  onPreferencesChange: (preferences: GuitarPreferences) => void
  playMidi: (midi: number) => void
  playEvents: (events: PlayableEvent[]) => void
  tonicSymbol: string
}

function ScalesView({
  patterns,
  preferences,
  onPreferencesChange,
  playMidi,
  playEvents,
  tonicSymbol,
}: ScalesViewProps) {
  const tr = useT()
  const [requestedFamily, setRequestedFamily] = useState<PatternFamilyChoice>('recommended')
  const [selectedPatternByFamily, setSelectedPatternByFamily] = useState<Record<string, string>>({})
  const [selectedRouteByPattern, setSelectedRouteByPattern] = useState<Record<string, string>>({})
  const {
    options: generationOptions,
    ranked: rankedPatterns,
    recommended: recommendedGroups,
  } = rankedScaleGroups(patterns, preferences)
  const playback = usePatternPlayback(preferences.tempo, playEvents)
  const patternGroupsByFamily = new Map<PatternFamilyChoice, ScalePatternDisplayGroup[]>()
  patternGroupsByFamily.set('recommended', recommendedGroups)
  SCALE_FAMILY_IDS.forEach((familyId) => {
    if (familyId === 'recommended') return
    patternGroupsByFamily.set(
      familyId,
      groupScalePatternsForDisplay(
        rankedPatterns.filter((pattern) => pattern.system === familyId),
      ),
    )
  })
  const effectiveFamily = requestedFamily
  const activeGroups = patternGroupsByFamily.get(effectiveFamily) ?? []
  const activePatterns = activeGroups.map((group) => group.pattern)
  const selectedPatternId = selectedPatternByFamily[effectiveFamily] ?? ''
  const selectedGroup = activeGroups.find((group) =>
    group.equivalentIds.includes(selectedPatternId),
  ) ?? activeGroups[0]
  const selectedPattern = selectedGroup?.pattern
  const availableRoutes: PatternRoute[] = selectedPattern
    ? routesOf(selectedPattern, tr('ws.route'))
    : []
  const selectedRouteId = selectedGroup
    ? selectedGroup.equivalentIds
        .map((id) => selectedRouteByPattern[id])
        .find((id) => id !== undefined) ?? selectedPattern?.defaultRouteId
    : undefined
  const selectedRoute =
    availableRoutes.find((route) => route.id === selectedRouteId) ?? availableRoutes[0]
  // The library is a library of shapes, and a shape is learnt upwards: the
  // descending run belongs to the notes tab, where the melodic minor actually
  // changes on the way down.
  const selectedEvents = selectedRoute?.ascending ?? []
  const routeLocationIds = selectedEvents.flatMap((event) =>
    event.locationId ? [event.locationId] : [],
  )
  const firstRouteEvent = selectedEvents[0]
  const lastRouteEvent = selectedEvents.at(-1)
  const tonicRoute = selectedRoute?.kind.startsWith('tonic-') ?? false
  const routeOctaves = tonicRoute && firstRouteEvent && lastRouteEvent
    ? Math.max(1, Math.round(Math.abs(lastRouteEvent.midi - firstRouteEvent.midi) / 12))
    : 0
  const routeLabel = tonicRoute
    ? Array.from({ length: routeOctaves + 1 }, () => tonicSymbol).join(' → ')
    : tr('ws.routeNotes', { name: selectedRoute?.name ?? tr('ws.route'), count: selectedEvents.length })
  const showScaleFingerings = preferences.showScaleFingerings ?? true
  const showScaleShifts = preferences.showScaleShifts ?? true

  // Drop a running highlight whenever the shape or the route under it changes.
  const clearPlayback = playback.clear
  useEffect(() => {
    clearPlayback()
    return clearPlayback
  }, [clearPlayback, selectedPattern?.id, selectedRoute?.id])

  const comfortLabel = selectedPattern?.ergonomics
    ? selectedPattern.ergonomics.difficulty <= 1
      ? tr('ws.comfort.easy')
      : selectedPattern.ergonomics.difficulty <= 3
        ? tr('ws.comfort.medium')
        : tr('ws.comfort.hard')
    : tr('ws.comfort.none')
  const comfortTone = selectedPattern?.ergonomics
    ? selectedPattern.ergonomics.difficulty <= 1
      ? 'easy'
      : selectedPattern.ergonomics.difficulty <= 3 ? 'medium' : 'hard'
    : 'medium'
  const profileLabel = generationOptions.reachProfile === 'compact'
    ? tr('ws.profile.compact')
    : generationOptions.reachProfile === 'stretch' ? tr('ws.profile.stretch') : tr('ws.profile.balanced')
  const viewport = selectedPattern
    ? {
        fromFret: Math.max(0, selectedPattern.startPosition - 1),
        toFret: Math.min(preferences.config.frets, selectedPattern.endPosition + 1),
      }
    : undefined

  return (
    <section className="workspace-section" aria-labelledby="scales-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tr('ws.scaleFingerings')}</span>
          <h3 id="scales-heading">{tr('ws.fingeringLibrary')}</h3>
        </div>
      </div>

      {activePatterns.length === 0 || !selectedPattern ? (
        <div className="empty-state">
          <strong>{tr('ws.familyUnavailable')}</strong>
          <p>{tr('ws.familyUnavailableHint')}</p>
        </div>
      ) : (
        <>
          {/* Family and shape were two rows of the same choice, with the family
              repeated again on every chip. It is a filter over one list now. */}
          <div className="pattern-browser">
            <label className="family-filter">
              <span>{tr('ws.familyTabsAria')}</span>
              <select
                value={effectiveFamily}
                onChange={(event) => setRequestedFamily(event.target.value as PatternFamilyChoice)}
              >
                {SCALE_FAMILY_IDS.map((familyId) => (
                  <option key={familyId} value={familyId}>
                    {familyLabel(familyId)} · {patternGroupsByFamily.get(familyId)?.length ?? 0}
                  </option>
                ))}
              </select>
            </label>
            <div className="pattern-picker" role="list" aria-label={tr('ws.positionsAria')}>
            {activePatterns.map((pattern) => (
              <button
                type="button"
                role="listitem"
                key={pattern.id}
                className={selectedPattern.id === pattern.id ? 'pattern-chip is-active' : 'pattern-chip'}
                onClick={() => setSelectedPatternByFamily((current) => ({
                  ...current,
                  [effectiveFamily]: pattern.id,
                }))}
              >
                <strong>{pattern.name}</strong>
                <span>
                  {tr('ws.fretRange', { start: pattern.startPosition, end: pattern.endPosition })}
                  {effectiveFamily === 'recommended' && (
                    <> · {familyLabel(pattern.system)}</>
                  )}
                  {pattern.preferredVariant && <> · {tr('ws.bestStart.inline')}</>}
                </span>
              </button>
            ))}
            </div>
          </div>

          {/* The chip above already carries the name, the frets and the family;
              the line keeps them next to the play button and folds everything
              that is genuinely extra out of the way. */}
          <div className="pattern-line">
            <p>
              <strong>{selectedPattern.name}</strong>
              {' · '}
              {tr('ws.fretRange', { start: selectedPattern.startPosition, end: selectedPattern.endPosition })}
              {' · '}
              {familyLabel(selectedPattern.system)}
            </p>
            <AudioButton
              label={tr('ws.playRoute')}
              onClick={() => playback.play(selectedEvents)}
              disabled={selectedEvents.length === 0}
            />
          </div>

          <details className="filter-panel">
            <summary>
              <span>{tr('ws.shapeDetails')}</span>
              <span className="filter-summary">{comfortLabel}</span>
            </summary>
            <div className="pattern-details">
              <p>{selectedPattern.description}</p>
              <p className="pattern-equivalents">{tr('ws.profileBadge', { profile: profileLabel })}</p>
              {selectedGroup.aliasNames.length > 0 && (
                <p className="pattern-equivalents">
                  {tr('ws.matchesOnBoard')} <strong>{selectedGroup.aliasNames.join(', ')}</strong>
                </p>
              )}
              <p className="route-summary">{tr('ws.routeSummary')} <strong>{routeLabel}</strong></p>
              {selectedPattern.tags && selectedPattern.tags.length > 0 && (
                <div className="pattern-tags" aria-label={tr('ws.patternTagsAria')}>
                  <span className={`comfort-badge comfort-badge--${comfortTone}`}>{comfortLabel}</span>
                  {selectedPattern.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  {selectedPattern.preferredVariant && <span>{tr('ws.bestStart')}</span>}
                  {selectedPattern.ergonomics && (
                    <span>{tr('ws.shiftsCount', { n: selectedPattern.ergonomics.shifts })}</span>
                  )}
                </div>
              )}
            </div>
          </details>

          <div className="scale-route-row">
            <div>
              <span className="control-label">{tr('ws.exerciseRoute')}</span>
              <div className="segmented route-selector" role="radiogroup" aria-label={tr('ws.exerciseRoute')}>
                {availableRoutes.map((route) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedRoute?.id === route.id}
                    className={selectedRoute?.id === route.id ? 'is-active' : ''}
                    key={route.id}
                    onClick={() => setSelectedRouteByPattern((current) => ({
                      ...current,
                      [selectedPattern.id]: route.id,
                    }))}
                  >
                    {route.name}
                  </button>
                ))}
              </div>
            </div>
            <details className="filter-panel view-panel">
              <summary>
                <span>{tr('ws.viewOptions')}</span>
              </summary>
              <div className="scale-view-toolbar">
              <LabelModeToggle preferences={preferences} onChange={onPreferencesChange} />
              <button
                type="button"
                className={showScaleFingerings ? 'view-toggle is-active' : 'view-toggle'}
                aria-pressed={showScaleFingerings}
                onClick={() => onPreferencesChange({
                  ...preferences,
                  showScaleFingerings: !showScaleFingerings,
                })}
              >
                {tr('ws.fingers')}
              </button>
              <button
                type="button"
                className={showScaleShifts ? 'view-toggle is-active' : 'view-toggle'}
                aria-pressed={showScaleShifts}
                onClick={() => onPreferencesChange({
                  ...preferences,
                  showScaleShifts: !showScaleShifts,
                })}
              >
                {tr('ws.transitions')}
              </button>
              </div>
            </details>
          </div>
          <Fretboard
            config={preferences.config}
            locations={selectedPattern.locations}
            labelMode={preferences.fretboardLabels}
            onPlayNote={playMidi}
            compact
            activeLocationId={playback.activeLocationId}
            activeStepIndex={playback.activeStepIndex}
            routeLocationIds={routeLocationIds}
            routeEvents={selectedEvents}
            viewport={viewport}
            showFingerings={showScaleFingerings}
            showShifts={showScaleShifts}
          />
          <div className="fretboard-legend scale-legend" aria-label={tr('ws.scaleLegendAria')}>
            <span><i className="legend-dot legend-dot--root" /> {tr('ws.tonic')}</span>
            <span><i className="legend-dot" /> {tr('ws.routeLegend')}</span>
            {showScaleFingerings && <span><i className="legend-finger">1–4</i> {tr('ws.fingersLegend')}</span>}
            {showScaleShifts && <span><i className="legend-shift" /> {tr('ws.shiftLegend')}</span>}
          </div>
          <Tablature
            config={preferences.config}
            locations={selectedPattern.locations}
            events={selectedEvents}
            direction="ascending"
            activeStepIndex={playback.activeStepIndex}
            showFingerings={showScaleFingerings}
            showShifts={showScaleShifts}
          />
        </>
      )}
    </section>
  )
}

/**
 * One run up and back down, which is how a scale is actually practised. The
 * routes store the two directions separately and both include the turning
 * note, so the repeat is dropped when the top of the run matches.
 */
function upAndDownEvents(route: PatternRoute): PlayableEvent[] {
  const up = route.ascending
  if (up.length === 0) return route.descending
  const end = up.reduce((latest, event) => Math.max(latest, event.startBeat + event.durationBeats), 0)
  const turnsOnSameNote = route.descending[0]?.midi === up.at(-1)?.midi
  const tail = turnsOnSameNote ? route.descending.slice(1) : route.descending
  const base = tail[0]?.startBeat ?? 0
  return [...up, ...tail.map((event) => ({ ...event, startBeat: event.startBeat - base + end }))]
}

interface PracticeScaleViewProps {
  patterns: PerformancePattern<FretLocation>[]
  locations: FretLocation[]
  preferences: GuitarPreferences
  onPreferencesChange: (preferences: GuitarPreferences) => void
  pick: number
  revealed: boolean
  playMidi: (midi: number) => void
  playEvents: (events: PlayableEvent[]) => void
}

/**
 * The practice fretboard step. The round hands over a number in [0, 1) and the
 * instrument turns it into a concrete assignment, so the player is sent to a
 * shape they did not choose instead of the one they always fall back on.
 */
function PracticeScaleView({
  patterns,
  locations,
  preferences,
  onPreferencesChange,
  pick,
  revealed,
  playMidi,
  playEvents,
}: PracticeScaleViewProps) {
  const tr = useT()
  const playback = usePatternPlayback(preferences.tempo, playEvents)
  const { recommended } = rankedScaleGroups(patterns, preferences)
  const group = recommended[Math.min(recommended.length - 1, Math.floor(pick * recommended.length))]
  const pattern = group?.pattern
  const routes = pattern ? routesOf(pattern, tr('ws.route')) : []
  const route = routes.find((candidate) => candidate.id === pattern?.defaultRouteId) ?? routes[0]
  const events = route ? upAndDownEvents(route) : []

  if (!pattern) {
    return (
      <div className="empty-state">
        <strong>{tr('ws.familyUnavailable')}</strong>
        <p>{tr('ws.familyUnavailableHint')}</p>
      </div>
    )
  }

  const viewport = {
    fromFret: Math.max(0, pattern.startPosition - 1),
    toFret: Math.min(preferences.config.frets, pattern.endPosition + 1),
  }

  return (
    <div className="practice-assignment">
      <div className="practice-assignment__head">
        <div>
          <span className="eyebrow">{familyLabel(pattern.system)}</span>
          <h4>{pattern.name}</h4>
          <p>
            {tr('ws.fretRange', { start: pattern.startPosition, end: pattern.endPosition })}
            {route && <> · {route.name}</>}
          </p>
        </div>
        <div className="practice-assignment__controls">
          <AudioButton
            label={tr('practice.reference')}
            onClick={() => playback.play(events)}
            disabled={events.length === 0}
          />
        </div>
      </div>

      {revealed && (
        <>
          <Fretboard
            config={preferences.config}
            locations={pattern.locations}
            labelMode={preferences.fretboardLabels}
            onPlayNote={playMidi}
            compact
            activeLocationId={playback.activeLocationId}
            activeStepIndex={playback.activeStepIndex}
            routeLocationIds={events.flatMap((event) => (event.locationId ? [event.locationId] : []))}
            routeEvents={events}
            viewport={viewport}
            showFingerings={preferences.showScaleFingerings ?? true}
            showShifts={preferences.showScaleShifts ?? true}
          />
          <Tablature
            config={preferences.config}
            locations={pattern.locations}
            events={events}
            direction="ascending"
            label={tr('practice.upAndDown')}
            activeStepIndex={playback.activeStepIndex}
            showFingerings={preferences.showScaleFingerings ?? true}
            showShifts={preferences.showScaleShifts ?? true}
          />
        </>
      )}

      <details className="filter-panel full-neck-panel">
        <summary>
          <span>{tr('ws.allNotes')}</span>
          <span className="filter-summary">{tr('practice.neckHint')}</span>
        </summary>
        <div className="full-neck-panel__body">
          <FullNeck
            locations={locations}
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
            playMidi={playMidi}
            withHeading={false}
          />
        </div>
      </details>
    </div>
  )
}

function updateConstraints(
  preferences: GuitarPreferences,
  patch: Partial<VoicingConstraints>,
): GuitarPreferences {
  return { ...preferences, constraints: { ...preferences.constraints, ...patch } }
}

interface VoicingFiltersProps {
  preferences: GuitarPreferences
  onChange: (preferences: GuitarPreferences) => void
}

function VoicingFilters({ preferences, onChange }: VoicingFiltersProps) {
  const tr = useT()
  const { constraints, config } = preferences
  return (
    <details className="filter-panel">
      <summary>
        <span>{tr('ws.voicingFilters')}</span>
        <span className="filter-summary">{tr('ws.filterSummary', { span: constraints.maxSpan, bass: constraints.bass === 'root' ? tr('ws.bassInBass') : tr('ws.anyBass') })}</span>
      </summary>
      <div className="filter-grid">
        <label>
          <span>{tr('ws.stretch', { span: constraints.maxSpan })}</span>
          <input
            type="range"
            min="3"
            max="6"
            value={constraints.maxSpan}
            onChange={(event) =>
              onChange(updateConstraints(preferences, { maxSpan: Number(event.target.value) }))
            }
          />
        </label>
        <label>
          <span>{tr('ws.minSounding')}</span>
          <select
            value={constraints.minSoundingStrings}
            onChange={(event) =>
              onChange(
                updateConstraints(preferences, { minSoundingStrings: Number(event.target.value) }),
              )
            }
          >
            {Array.from({ length: config.strings.length - 2 }, (_, index) => index + 3).map((count) => (
              <option key={count} value={count}>{count}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{tr('ws.bassNote')}</span>
          <select
            value={constraints.bass}
            onChange={(event) =>
              onChange(updateConstraints(preferences, { bass: event.target.value as BassFilter }))
            }
          >
            <option value="any">{tr('ws.bass.any')}</option>
            <option value="root">{tr('ws.bass.root')}</option>
            <option value="first">{tr('ws.bass.first')}</option>
            <option value="second">{tr('ws.bass.second')}</option>
            <option value="third">{tr('ws.bass.third')}</option>
          </select>
        </label>
        <div className="fret-range-control">
          <span>{tr('ws.fretRangeLabel')}</span>
          <div>
            <label>
              {tr('ws.from')}
              <input
                type="number"
                min="0"
                max={constraints.fretTo}
                value={constraints.fretFrom}
                onChange={(event) =>
                  onChange(
                    updateConstraints(preferences, {
                      fretFrom: Math.max(0, Math.min(Number(event.target.value), constraints.fretTo)),
                    }),
                  )
                }
              />
            </label>
            <label>
              {tr('ws.to')}
              <input
                type="number"
                min={constraints.fretFrom}
                max={config.frets}
                value={Math.min(constraints.fretTo, config.frets)}
                onChange={(event) =>
                  onChange(
                    updateConstraints(preferences, {
                      fretTo: Math.max(
                        constraints.fretFrom,
                        Math.min(Number(event.target.value), config.frets),
                      ),
                    }),
                  )
                }
              />
            </label>
          </div>
        </div>
        <label className="check-control">
          <input
            type="checkbox"
            checked={constraints.allowOpen}
            onChange={(event) =>
              onChange(updateConstraints(preferences, { allowOpen: event.target.checked }))
            }
          />
          {tr('ws.openStringsToggle')}
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={constraints.allowBarre}
            onChange={(event) =>
              onChange(updateConstraints(preferences, { allowBarre: event.target.checked }))
            }
          />
          {tr('ws.allowBarre')}
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={constraints.allowInnerMutes}
            onChange={(event) =>
              onChange(updateConstraints(preferences, { allowInnerMutes: event.target.checked }))
            }
          />
          {tr('ws.stringSkips')}
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={preferences.showFingerings}
            onChange={(event) => onChange({ ...preferences, showFingerings: event.target.checked })}
          />
          {tr('ws.showFingersBarre')}
        </label>
      </div>
    </details>
  )
}

interface VoicingCardProps {
  voicing: GuitarVoicing
  chord: ChordDefinition
  preferences: GuitarPreferences
  playEvents: (events: PlayableEvent[]) => void
}

function VoicingCard({ voicing, chord, preferences, playEvents }: VoicingCardProps) {
  const tr = useT()
  const blockEvents = voicingToEvents(voicing)
  const arpeggioEvents = blockEvents
    .slice()
    .sort((a, b) => a.midi - b.midi)
    .map((event, index) => ({ ...event, startBeat: index * 0.36, durationBeats: 0.85 }))
  return (
    <article className="voicing-card">
      <ChordDiagram
        config={preferences.config}
        voicing={voicing}
        chordSymbol={chord.symbol}
        showFingerings={preferences.showFingerings}
      />
      <div className="voicing-card__actions">
        <button type="button" onClick={() => playEvents(blockEvents)} aria-label={tr('ws.playChordAria')}>
          <span aria-hidden="true">▶</span> {tr('ws.chord')}
        </button>
        <button type="button" onClick={() => playEvents(arpeggioEvents)} aria-label={tr('ws.playArpeggioAria')}>
          <span aria-hidden="true">≋</span> {tr('ws.arpeggio')}
        </button>
      </div>
    </article>
  )
}

interface PentatonicDegreeRowProps {
  pentatonic: PentatonicScale
  playMidi: (midi: number) => void
}

/**
 * The parent scale with its two dropped degrees greyed out, which is the whole
 * idea in one row: a pentatonic is the key minus the notes that rub. The blues
 * ♭5 slots in at its own pitch rather than replacing one of the five.
 */
function PentatonicDegreeRow({ pentatonic, playMidi }: PentatonicDegreeRowProps) {
  const tr = useT()
  const droppedDegrees = new Set(pentatonic.omitted.map((note) => note.degree))
  const cards = [
    ...pentatonic.parent.ascending.map((note) => ({
      note,
      dropped: droppedDegrees.has(note.degree),
      blue: false,
    })),
    ...(pentatonic.blueNote && pentatonic.notes.includes(pentatonic.blueNote)
      ? [{ note: pentatonic.blueNote, dropped: false, blue: true }]
      : []),
  ].sort((a, b) => a.note.interval - b.note.interval)
  const midis = ascendingScaleMidis(cards.map((card) => card.note))

  return (
    <div className="note-strip note-strip--pentatonic">
      {cards.map((card, index) => {
        const modifiers = [
          card.note.degree === 1 && !card.blue ? 'is-root' : '',
          card.dropped ? 'is-dropped' : '',
          card.blue ? 'is-blue' : '',
        ].filter(Boolean)
        return (
          <button
            type="button"
            className={['note-card', ...modifiers].join(' ')}
            key={`${card.note.symbol}-${card.note.degreeLabel}`}
            onClick={() => playMidi(midis[index] ?? midiNearMiddleC(card.note.pitchClass))}
            aria-label={tr('ws.degreeNoteAria', {
              degree: card.note.degree,
              note: card.note.accessibleName,
            })}
          >
            <span className="note-card__degree">{card.note.degreeLabel}</span>
            <strong>{card.note.symbol}</strong>
            <span>{card.blue ? tr('ws.pent.blueNote') : card.note.solfege}</span>
          </button>
        )
      })}
    </div>
  )
}

interface PentatonicBoardProps {
  pattern: PerformancePattern<FretLocation>
  preferences: GuitarPreferences
  playMidi: (midi: number) => void
  playback: PatternPlayback
  events: PlayableEvent[]
  blueNote: ScaleNote | null
}

/** The selected box on the neck and in tab — shared by the tab and practice. */
function PentatonicBoard({
  pattern,
  preferences,
  playMidi,
  playback,
  events,
  blueNote,
}: PentatonicBoardProps) {
  const tr = useT()
  const viewport = {
    fromFret: Math.max(0, pattern.startPosition - 1),
    toFret: Math.min(preferences.config.frets, pattern.endPosition + 1),
  }
  const showFingerings = preferences.showScaleFingerings ?? true

  return (
    <>
      <Fretboard
        config={preferences.config}
        locations={pattern.locations}
        labelMode={preferences.fretboardLabels}
        onPlayNote={playMidi}
        compact
        activeLocationId={playback.activeLocationId}
        activeStepIndex={playback.activeStepIndex}
        routeLocationIds={events.flatMap((event) => (event.locationId ? [event.locationId] : []))}
        routeEvents={events}
        viewport={viewport}
        accentPitchClasses={blueNote ? [blueNote.pitchClass] : undefined}
        showFingerings={showFingerings}
        showShifts={preferences.showScaleShifts ?? true}
      />
      <div className="fretboard-legend scale-legend" aria-label={tr('ws.scaleLegendAria')}>
        <span><i className="legend-dot legend-dot--root" /> {tr('ws.tonic')}</span>
        <span><i className="legend-dot" /> {tr('ws.routeLegend')}</span>
        {blueNote && (
          <span>
            <i className="legend-dot legend-dot--blue" /> {tr('ws.pent.blueNote')} · {blueNote.symbol}
          </span>
        )}
      </div>
      <Tablature
        config={preferences.config}
        locations={pattern.locations}
        events={events}
        direction="ascending"
        label={tr('practice.upAndDown')}
        activeStepIndex={playback.activeStepIndex}
        showFingerings={showFingerings}
        showShifts={preferences.showScaleShifts ?? true}
      />
    </>
  )
}

interface PentatonicViewProps {
  pentatonic: PentatonicScale
  patterns: PerformancePattern<FretLocation>[]
  preferences: GuitarPreferences
  onPreferencesChange: (preferences: GuitarPreferences) => void
  blues: boolean
  onBluesChange: (blues: boolean) => void
  playMidi: (midi: number) => void
  playEvents: (events: PlayableEvent[]) => void
}

function PentatonicView({
  pentatonic,
  patterns,
  preferences,
  onPreferencesChange,
  blues,
  onBluesChange,
  playMidi,
  playEvents,
}: PentatonicViewProps) {
  const tr = useT()
  const playback = usePatternPlayback(preferences.tempo, playEvents)
  const [selectedBoxId, setSelectedBoxId] = useState<string>('')
  const selectedPattern = patterns.find((pattern) => pattern.id === selectedBoxId) ?? patterns[0]
  const route = selectedPattern ? routesOf(selectedPattern, tr('ws.route'))[0] : undefined
  const events = route ? upAndDownEvents(route) : []

  const clearPlayback = playback.clear
  useEffect(() => {
    clearPlayback()
    return clearPlayback
  }, [clearPlayback, selectedPattern?.id])

  return (
    <section className="workspace-section" aria-labelledby="pentatonic-heading">
      <div className="section-heading section-heading--wrap">
        <div>
          <span className="eyebrow">{tr('ws.pent.eyebrow')}</span>
          <h3 id="pentatonic-heading">{pentatonicDisplayName(pentatonic)}</h3>
        </div>
        <div className="pentatonic-controls">
          <button
            type="button"
            className={blues ? 'view-toggle is-active' : 'view-toggle'}
            aria-pressed={blues}
            aria-label={tr('ws.pent.bluesAria')}
            onClick={() => onBluesChange(!blues)}
          >
            {tr('ws.pent.blues')}
          </button>
        </div>
      </div>

      <PentatonicDegreeRow pentatonic={pentatonic} playMidi={playMidi} />
      <p className="pentatonic-note">
        {tr('ws.pent.dropped', {
          notes: pentatonic.omitted.map((note) => note.symbol).join(', '),
        })}
        {' · '}
        {tr('ws.pent.relative', { name: keyDisplayName(pentatonic.relative) })}
      </p>

      {!selectedPattern ? (
        <div className="empty-state">
          <strong>{tr('ws.pent.noBoxes')}</strong>
          <p>{tr('ws.pent.noBoxesHint')}</p>
        </div>
      ) : (
        <>
          <div className="subsection-heading">
            <div>
              <h4>{tr('ws.pent.boxesAria')}</h4>
              <p>{tr('ws.pent.boxesHint')}</p>
            </div>
            <LabelModeToggle preferences={preferences} onChange={onPreferencesChange} />
          </div>

          <div className="pattern-picker" role="list" aria-label={tr('ws.pent.boxesAria')}>
            {patterns.map((pattern) => (
              <button
                type="button"
                role="listitem"
                key={pattern.id}
                className={
                  selectedPattern.id === pattern.id ? 'pattern-chip is-active' : 'pattern-chip'
                }
                onClick={() => setSelectedBoxId(pattern.id)}
              >
                <strong>{pattern.name}</strong>
                <span>
                  {tr('ws.fretRange', {
                    start: pattern.startPosition,
                    end: pattern.endPosition,
                  })}
                </span>
              </button>
            ))}
          </div>

          <div className="pattern-summary">
            <div>
              <span className="eyebrow">{tr('ws.selectedFingering')}</span>
              <div className="pattern-summary__title">
                <h4>{selectedPattern.name}</h4>
              </div>
              <p>{selectedPattern.description}</p>
            </div>
            <AudioButton
              label={tr('ws.pent.play')}
              onClick={() => playback.play(events)}
              disabled={events.length === 0}
            />
          </div>

          <PentatonicBoard
            pattern={selectedPattern}
            preferences={preferences}
            playMidi={playMidi}
            playback={playback}
            events={events}
            blueNote={blues ? pentatonic.blueNote : null}
          />
        </>
      )}
    </section>
  )
}

interface PracticePentatonicViewProps {
  patterns: PerformancePattern<FretLocation>[]
  preferences: GuitarPreferences
  pick: number
  revealed: boolean
  playMidi: (midi: number) => void
  playEvents: (events: PlayableEvent[]) => void
}

/**
 * The pentatonic step of a round. The box is drawn for the player, and the
 * neck stays covered until they say they have played it — the degrees above it
 * are already on screen, so the question is the shape, not the notes.
 */
function PracticePentatonicView({
  patterns,
  preferences,
  pick,
  revealed,
  playMidi,
  playEvents,
}: PracticePentatonicViewProps) {
  const tr = useT()
  const playback = usePatternPlayback(preferences.tempo, playEvents)
  const pattern = patterns[Math.min(patterns.length - 1, Math.floor(pick * patterns.length))]
  const route = pattern ? routesOf(pattern, tr('ws.route'))[0] : undefined
  const events = route ? upAndDownEvents(route) : []

  if (!pattern) {
    return (
      <div className="empty-state">
        <strong>{tr('ws.pent.noBoxes')}</strong>
        <p>{tr('ws.pent.noBoxesHint')}</p>
      </div>
    )
  }

  return (
    <div className="practice-assignment">
      <div className="practice-assignment__head">
        <div>
          <span className="eyebrow">{familyLabel(pattern.system)}</span>
          <h4>{pattern.name}</h4>
          <p>{tr('ws.fretRange', { start: pattern.startPosition, end: pattern.endPosition })}</p>
        </div>
        <div className="practice-assignment__controls">
          <AudioButton
            label={tr('practice.reference')}
            onClick={() => playback.play(events)}
            disabled={events.length === 0}
          />
        </div>
      </div>

      {revealed && (
        <PentatonicBoard
          pattern={pattern}
          preferences={preferences}
          playMidi={playMidi}
          playback={playback}
          events={events}
          blueNote={null}
        />
      )}
    </div>
  )
}

interface ChordsViewProps {
  harmony: InstrumentWorkspaceProps['harmony']
  preferences: GuitarPreferences
  onPreferencesChange: (preferences: GuitarPreferences) => void
  playEvents: (events: PlayableEvent[]) => void
  /** Practice opens on the degree it just asked about. */
  initialDegree?: number
}

function ChordsView({
  harmony,
  preferences,
  onPreferencesChange,
  playEvents,
  initialDegree = 1,
}: ChordsViewProps) {
  const tr = useT()
  const [selectedDegree, setSelectedDegree] = useState(initialDegree)
  const [size, setSize] = useState<'triad' | 'seventh'>('triad')
  const [visibleCount, setVisibleCount] = useState(8)
  const degree = harmony[selectedDegree - 1] ?? harmony[0]
  const chord = size === 'triad' ? degree?.triad : degree?.seventh
  const request = useMemo(
    () =>
      chord
        ? {
            config: preferences.config,
            chord,
            constraints: {
              ...preferences.constraints,
              fretTo: Math.min(preferences.constraints.fretTo, preferences.config.frets),
            },
          }
        : null,
    [chord, preferences.config, preferences.constraints],
  )
  const { voicings, loading, error } = useVoicings(request)

  if (!degree || !chord) return null

  const chooseDegree = (nextDegree: number) => {
    setSelectedDegree(nextDegree)
    setVisibleCount(8)
  }

  return (
    <section className="workspace-section" aria-labelledby="chords-heading">
      <div className="section-heading section-heading--wrap">
        <div>
          <span className="eyebrow">{tr('ws.scaleHarmonization')}</span>
          <h3 id="chords-heading">{tr('ws.diatonicChords')}</h3>
        </div>
        <div className="segmented" aria-label={tr('ws.chordTypeAria')}>
          <button
            type="button"
            className={size === 'triad' ? 'is-active' : ''}
            onClick={() => { setSize('triad'); setVisibleCount(8) }}
          >
            {tr('ws.triads')}
          </button>
          <button
            type="button"
            className={size === 'seventh' ? 'is-active' : ''}
            onClick={() => { setSize('seventh'); setVisibleCount(8) }}
          >
            {tr('ws.sevenths')}
          </button>
        </div>
      </div>

      <div className="chord-picker" role="list" aria-label={tr('ws.degreesChordsAria')}>
        {harmony.map((item) => {
          const itemChord = size === 'triad' ? item.triad : item.seventh
          return (
            <button
              type="button"
              role="listitem"
              key={item.degree}
              className={item.degree === degree.degree ? 'chord-chip is-active' : 'chord-chip'}
              onClick={() => chooseDegree(item.degree)}
            >
              <span>{itemChord.roman}</span>
              <strong>{itemChord.symbol}</strong>
              <small>{itemChord.notes.map((note) => note.symbol).join(' · ')}</small>
            </button>
          )
        })}
      </div>

      <div className="selected-chord-summary">
        <div className="selected-chord-summary__symbol">{chord.symbol}</div>
        <div>
          <span className="eyebrow">{tr('ws.degreeLabel', { roman: chord.roman })}</span>
          <h4>{chord.qualityLabel}</h4>
          <p>{chord.notes.map((note) => `${note.symbol} (${note.solfege})`).join(' · ')}</p>
        </div>
      </div>

      <VoicingFilters preferences={preferences} onChange={onPreferencesChange} />

      <div className="voicing-results-heading">
        <div>
          <h4>{tr('ws.practicalFingerings')}</h4>
          <p>{loading ? tr('ws.calculating') : tr('ws.found', { count: voicings.length })}</p>
        </div>
      </div>

      {error && <div className="error-callout">{error}</div>}
      {loading ? (
        <div className="voicing-grid" aria-busy="true" aria-label={tr('ws.voicingBusyAria')}>
          {Array.from({ length: 4 }, (_, index) => <div className="voicing-skeleton" key={index} />)}
        </div>
      ) : voicings.length === 0 ? (
        <div className="empty-state">
          <strong>{tr('ws.noShapes')}</strong>
          <p>{tr('ws.noShapesHint')}</p>
        </div>
      ) : (
        <>
          <div className="voicing-grid">
            {voicings.slice(0, visibleCount).map((voicing) => (
              <VoicingCard
                key={voicing.id}
                voicing={voicing}
                chord={chord}
                preferences={preferences}
                playEvents={playEvents}
              />
            ))}
          </div>
          {visibleCount < voicings.length && (
            <button
              type="button"
              className="secondary-button load-more"
              onClick={() => setVisibleCount((count) => count + 8)}
            >
              {tr('ws.showMore', { count: voicings.length })}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export function GuitarWorkspace({
  activeNotes,
  harmony,
  shareState,
  section,
  settingsOpen,
  onCloseSettings,
  practice,
}: InstrumentWorkspaceProps) {
  const tr = useT()
  const lang = useLang()
  // Per-instrument tuning presets, string counts, storage key and defaults.
  // The workspace is remounted on instrument change (key in App), so reading
  // the spec once here is enough.
  const spec = getFrettedSpec(shareState.instrument) ?? guitarSpec
  const [preferences, setPreferences] = usePersistentState<GuitarPreferences>(
    spec.storageKey,
    structuredClone(spec.defaultPreferences),
    spec.validatePreferences,
  )
  const synth = useSynth()
  const locations = useMemo(
    () => locateScaleOnFretboard(preferences.config, activeNotes),
    [activeNotes, preferences.config, lang],
  )
  const patternOptions = useMemo(
    () => ({
      reachProfile: preferences.scaleReachProfile ?? 'balanced' as const,
      playerLevel: preferences.playerLevel ?? 'intermediate' as const,
      handSize: preferences.handSize ?? 'medium' as const,
    }),
    [preferences.handSize, preferences.playerLevel, preferences.scaleReachProfile],
  )
  const patterns = useMemo(
    () => generateGuitarPatterns(
      preferences.config,
      activeNotes,
      shareState.direction,
      patternOptions,
    ),
    [activeNotes, patternOptions, preferences.config, shareState.direction, lang],
  )
  const [blues, setBlues] = useState(false)
  // Minor or major is the key's own question, answered on the circle: the tab
  // follows whichever side the selected key sits on and never argues with it.
  const pentatonic = useMemo(
    () => buildPentatonic(shareState.selection, defaultFlavor(shareState.selection), { blues }),
    [blues, shareState.selection, lang],
  )
  const pentatonicPatterns = useMemo(
    () =>
      generatePentatonicBoxPatterns(
        preferences.config,
        pentatonic.coreNotes,
        blues && pentatonic.blueNote ? [pentatonic.blueNote] : [],
      ),
    [blues, pentatonic, preferences.config, lang],
  )
  const playMidi = (midi: number) => synth.playMidi(midi, preferences.volume)
  const playEvents = (events: PlayableEvent[]) =>
    synth.playEvents(events, preferences.tempo, preferences.volume)
  const playScale = (direction: ScaleDirection) =>
    playEvents(scalePlaybackEvents(activeNotes, direction))
  // The two played steps run their own view instead of a tab.
  const isPlayedStep = practice?.step === 'scale' || practice?.step === 'pentatonic'

  return (
    <>
      {!practice && (
        <div className="instrument-meta-row">
          <span>{tr('ws.stringsCount', { n: preferences.config.strings.length })}</span>
          <span>{tr('ws.fretsCount', { n: preferences.config.frets })}</span>
          <span>{hasCagedTopology(preferences.config) ? tr('ws.cagedAvailable') : tr('ws.cagedUnavailable')}</span>
          {!synth.supported && <span>{tr('ws.audioUnsupported')}</span>}
        </div>
      )}

      {practice?.step === 'pentatonic' && (
        <PracticePentatonicView
          patterns={pentatonicPatterns}
          preferences={preferences}
          pick={practice.pentatonicPick}
          revealed={practice.revealed}
          playMidi={playMidi}
          playEvents={playEvents}
        />
      )}

      {practice?.step === 'scale' && (
        <PracticeScaleView
          patterns={patterns}
          locations={locations}
          preferences={preferences}
          onPreferencesChange={setPreferences}
          pick={practice.pick}
          revealed={practice.revealed}
          playMidi={playMidi}
          playEvents={playEvents}
        />
      )}

      {!isPlayedStep && section === 'notes' && (
        <NotesView
          activeNotes={activeNotes}
          locations={locations}
          preferences={preferences}
          onPreferencesChange={setPreferences}
          playMidi={playMidi}
          playScale={playScale}
          showFullNeck={practice === undefined}
        />
      )}
      {!isPlayedStep && section === 'scales' && (
        <ScalesView
          patterns={patterns}
          preferences={preferences}
          onPreferencesChange={setPreferences}
          playMidi={playMidi}
          playEvents={playEvents}
          tonicSymbol={activeNotes[0]?.symbol ?? ''}
        />
      )}
      {!isPlayedStep && section === 'pentatonic' && (
        <PentatonicView
          pentatonic={pentatonic}
          patterns={pentatonicPatterns}
          preferences={preferences}
          onPreferencesChange={setPreferences}
          blues={blues}
          onBluesChange={setBlues}
          playMidi={playMidi}
          playEvents={playEvents}
        />
      )}
      {!isPlayedStep && section === 'chords' && (
        <ChordsView
          harmony={harmony}
          preferences={preferences}
          onPreferencesChange={setPreferences}
          playEvents={playEvents}
          initialDegree={practice?.chordDegree}
        />
      )}

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
