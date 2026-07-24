import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  FretLocation,
  GuitarScaleFamily,
  PatternRoute,
  PerformancePattern,
  PlayableEvent,
} from '../instruments/types'
import {
  DEFAULT_GUITAR_PREFERENCES,
  generateGuitarPatterns,
  groupScalePatternsForDisplay,
  hasCagedTopology,
  isGuitarPreferences,
  locateScaleOnFretboard,
  rankScalePatterns,
  scaleGenerationOptions,
  voicingToEvents,
  type BassFilter,
  type GuitarPreferences,
  type GuitarVoicing,
  type VoicingConstraints,
} from '../instruments/guitar'
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

type PatternFamilyChoice = 'recommended' | GuitarScaleFamily

const SCALE_FAMILIES: Array<{ id: PatternFamilyChoice; label: string }> = [
  { id: 'recommended', label: 'Лучшие' },
  { id: 'caged', label: 'CAGED' },
  { id: 'position', label: '7 позиций' },
  { id: '3nps', label: '3NPS' },
  { id: 'one-octave', label: 'Однооктавные' },
  { id: 'two-octave', label: '2 октавы' },
  { id: 'extended', label: 'Расширенные' },
]

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
  return (
    <div className="segmented segmented--small" aria-label="Подписи на грифе">
      <button
        type="button"
        className={preferences.fretboardLabels === 'notes' ? 'is-active' : ''}
        onClick={() => onChange({ ...preferences, fretboardLabels: 'notes' })}
      >
        Ноты
      </button>
      <button
        type="button"
        className={preferences.fretboardLabels === 'degrees' ? 'is-active' : ''}
        onClick={() => onChange({ ...preferences, fretboardLabels: 'degrees' })}
      >
        Ступени
      </button>
    </div>
  )
}

interface NotesViewProps {
  activeNotes: ScaleNote[]
  locations: FretLocation[]
  preferences: GuitarPreferences
  onPreferencesChange: (preferences: GuitarPreferences) => void
  direction: ScaleDirection
  playMidi: (midi: number) => void
  playScale: () => void
}

function NotesView({
  activeNotes,
  locations,
  preferences,
  onPreferencesChange,
  direction,
  playMidi,
  playScale,
}: NotesViewProps) {
  const noteMidis = ascendingScaleMidis(activeNotes)

  return (
    <section className="workspace-section" aria-labelledby="notes-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Состав тональности</span>
          <h3 id="notes-heading">Семь ступеней</h3>
        </div>
        <AudioButton
          label={direction === 'ascending' ? 'Сыграть вверх' : 'Сыграть вниз'}
          onClick={playScale}
        />
      </div>

      <div className="note-strip">
        {activeNotes.map((note, index) => (
          <button
            type="button"
            className={note.degree === 1 ? 'note-card is-root' : 'note-card'}
            key={`${note.symbol}-${note.degree}`}
            onClick={() => playMidi(noteMidis[index] ?? midiNearMiddleC(note.pitchClass))}
            aria-label={`${note.degree} ступень, ${note.accessibleName}. Воспроизвести.`}
          >
            <span className="note-card__degree">{note.degreeLabel}</span>
            <strong>{note.symbol}</strong>
            <span>{note.solfege}</span>
          </button>
        ))}
      </div>

      <div className="subsection-heading">
        <div>
          <h4>Все ноты на грифе</h4>
          <p>Корневая нота выделена коралловым цветом. Нажмите любую позицию, чтобы услышать её.</p>
        </div>
        <LabelModeToggle preferences={preferences} onChange={onPreferencesChange} />
      </div>
      <Fretboard
        config={preferences.config}
        locations={locations}
        labelMode={preferences.fretboardLabels}
        onPlayNote={playMidi}
      />
      <div className="fretboard-legend" aria-label="Легенда грифа">
        <span><i className="legend-dot legend-dot--root" /> тоника</span>
        <span><i className="legend-dot" /> ноты гаммы</span>
        <span>Полный диапазон · {preferences.config.frets} лада</span>
      </div>
    </section>
  )
}

interface ScalesViewProps {
  patterns: PerformancePattern<FretLocation>[]
  preferences: GuitarPreferences
  onPreferencesChange: (preferences: GuitarPreferences) => void
  direction: ScaleDirection
  playMidi: (midi: number) => void
  playEvents: (events: PlayableEvent[]) => void
  tonicSymbol: string
}

function ScalesView({
  patterns,
  preferences,
  onPreferencesChange,
  direction,
  playMidi,
  playEvents,
  tonicSymbol,
}: ScalesViewProps) {
  const [requestedFamily, setRequestedFamily] = useState<PatternFamilyChoice>('recommended')
  const [selectedPatternByFamily, setSelectedPatternByFamily] = useState<Record<string, string>>({})
  const [selectedRouteByPattern, setSelectedRouteByPattern] = useState<Record<string, string>>({})
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null)
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null)
  const animationTimers = useRef<number[]>([])
  const generationOptions = scaleGenerationOptions(preferences)
  const rankedPatterns = rankScalePatterns(patterns, generationOptions)
  const globallyUniqueGroups = groupScalePatternsForDisplay(rankedPatterns)
  const markedRecommendationGroups = globallyUniqueGroups
    .filter((group) => group.pattern.recommended)
  const recommendationTarget = Math.max(
    6,
    rankedPatterns.filter((pattern) => pattern.recommended).length,
  )
  const recommendedGroups = [
    ...markedRecommendationGroups,
    ...globallyUniqueGroups.filter((group) => !group.pattern.recommended),
  ].slice(0, recommendationTarget)
  const patternGroupsByFamily = new Map<PatternFamilyChoice, typeof recommendedGroups>()
  patternGroupsByFamily.set('recommended', recommendedGroups)
  SCALE_FAMILIES.forEach((family) => {
    if (family.id === 'recommended') return
    patternGroupsByFamily.set(
      family.id,
      groupScalePatternsForDisplay(
        rankedPatterns.filter((pattern) => pattern.system === family.id),
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
  const fallbackRoute: PatternRoute | undefined = selectedPattern
    ? {
        id: 'legacy',
        name: 'Маршрут',
        kind: 'modal',
        ascending: selectedPattern.ascending,
        descending: selectedPattern.descending,
      }
    : undefined
  const availableRoutes = selectedPattern?.routes && selectedPattern.routes.length > 0
    ? selectedPattern.routes
    : fallbackRoute ? [fallbackRoute] : []
  const selectedRouteId = selectedGroup
    ? selectedGroup.equivalentIds
        .map((id) => selectedRouteByPattern[id])
        .find((id) => id !== undefined) ?? selectedPattern?.defaultRouteId
    : undefined
  const selectedRoute =
    availableRoutes.find((route) => route.id === selectedRouteId) ?? availableRoutes[0]
  const selectedEvents = selectedRoute
    ? direction === 'ascending' ? selectedRoute.ascending : selectedRoute.descending
    : []
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
    : `${selectedRoute?.name ?? 'Маршрут'} · ${selectedEvents.length} нот`
  const showScaleFingerings = preferences.showScaleFingerings ?? true
  const showScaleShifts = preferences.showScaleShifts ?? true

  const clearPlaybackAnimation = useCallback(() => {
    animationTimers.current.forEach((timer) => window.clearTimeout(timer))
    animationTimers.current = []
    setActiveLocationId(null)
    setActiveStepIndex(null)
  }, [])

  useEffect(() => {
    clearPlaybackAnimation()
    return clearPlaybackAnimation
  }, [clearPlaybackAnimation, direction, selectedPattern?.id, selectedRoute?.id])

  const playPattern = () => {
    const events = selectedEvents
    clearPlaybackAnimation()
    playEvents(events)
    const beatDurationMs = 60_000 / preferences.tempo

    events.forEach((event, index) => {
      const timer = window.setTimeout(() => {
        setActiveLocationId(event.locationId ?? null)
        setActiveStepIndex(index)
      }, event.startBeat * beatDurationMs)
      animationTimers.current.push(timer)
    })

    const finalBeat = events.reduce(
      (latest, event) => Math.max(latest, event.startBeat + event.durationBeats),
      0,
    )
    animationTimers.current.push(
      window.setTimeout(() => {
        setActiveLocationId(null)
        setActiveStepIndex(null)
      }, finalBeat * beatDurationMs + 80),
    )
  }

  const comfortLabel = selectedPattern?.ergonomics
    ? selectedPattern.ergonomics.difficulty <= 1
      ? 'Легко'
      : selectedPattern.ergonomics.difficulty <= 3
        ? 'Средне'
        : 'Требует растяжки'
    : 'Без оценки'
  const comfortTone = selectedPattern?.ergonomics
    ? selectedPattern.ergonomics.difficulty <= 1
      ? 'easy'
      : selectedPattern.ergonomics.difficulty <= 3 ? 'medium' : 'hard'
    : 'medium'
  const profileLabel = generationOptions.reachProfile === 'compact'
    ? 'Компактно'
    : generationOptions.reachProfile === 'stretch' ? 'Растяжка' : 'Баланс'
  const viewport = selectedPattern
    ? {
        fromFret: Math.max(0, selectedPattern.startPosition - 1),
        toFret: Math.min(preferences.config.frets, selectedPattern.endPosition + 1),
      }
    : undefined

  return (
    <section className="workspace-section" aria-labelledby="scales-heading">
      <div className="section-heading section-heading--wrap">
        <div>
          <span className="eyebrow">Аппликатуры гаммы</span>
          <h3 id="scales-heading">Библиотека аппликатур</h3>
        </div>
        <span className="practice-profile-badge">Профиль · {profileLabel}</span>
      </div>

      <div className="scale-family-tabs" role="tablist" aria-label="Семейство аппликатур">
        {SCALE_FAMILIES.map((family) => {
          const count = patternGroupsByFamily.get(family.id)?.length ?? 0
          return (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveFamily === family.id}
              className={effectiveFamily === family.id ? 'is-active' : ''}
              key={family.id}
              onClick={() => setRequestedFamily(family.id)}
            >
              {family.label}<small>{count}</small>
            </button>
          )
        })}
      </div>

      {activePatterns.length === 0 || !selectedPattern ? (
        <div className="empty-state">
          <strong>Это семейство недоступно в текущем строе.</strong>
          <p>CAGED требует стандартного шестиструнного блока. Позиционные, одно- и двухоктавные, а также расширенные маршруты продолжают рассчитываться под выбранный инструмент.</p>
        </div>
      ) : (
        <>
          <div className="pattern-picker" role="list" aria-label="Позиции гаммы">
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
                  {pattern.startPosition}–{pattern.endPosition} лады
                  {effectiveFamily === 'recommended' && (
                    <> · {SCALE_FAMILIES.find((family) => family.id === pattern.system)?.label}</>
                  )}
                  {pattern.preferredVariant && <> · лучший старт</>}
                </span>
              </button>
            ))}
          </div>

          <div className="pattern-summary">
            <div>
              <span className="eyebrow">Выбрана аппликатура</span>
              <div className="pattern-summary__title">
                <h4>{selectedPattern.name}</h4>
                <span className={`comfort-badge comfort-badge--${comfortTone}`}>{comfortLabel}</span>
              </div>
              <p>{selectedPattern.description}</p>
              {selectedGroup.aliasNames.length > 0 && (
                <p className="pattern-equivalents">
                  Совпадает на грифе с: <strong>{selectedGroup.aliasNames.join(', ')}</strong>
                </p>
              )}
              <p className="route-summary">Маршрут: <strong>{routeLabel}</strong></p>
              {selectedPattern.tags && selectedPattern.tags.length > 0 && (
                <div className="pattern-tags" aria-label="Характеристики аппликатуры">
                  {selectedPattern.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  {selectedPattern.preferredVariant && <span>Лучший старт</span>}
                  {selectedPattern.ergonomics && (
                    <span>{selectedPattern.ergonomics.shifts} смен позиции</span>
                  )}
                </div>
              )}
            </div>
            <AudioButton
              label={direction === 'ascending' ? 'Сыграть маршрут вверх' : 'Сыграть маршрут вниз'}
              onClick={playPattern}
              disabled={selectedEvents.length === 0}
            />
          </div>

          <div className="scale-route-row">
            <div>
              <span className="control-label">Маршрут упражнения</span>
              <div className="segmented route-selector" role="radiogroup" aria-label="Маршрут упражнения">
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
                Пальцы
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
                Переходы
              </button>
            </div>
          </div>
          <Fretboard
            config={preferences.config}
            locations={selectedPattern.locations}
            labelMode={preferences.fretboardLabels}
            onPlayNote={playMidi}
            compact
            activeLocationId={activeLocationId}
            activeStepIndex={activeStepIndex}
            routeLocationIds={routeLocationIds}
            routeEvents={selectedEvents}
            viewport={viewport}
            showFingerings={showScaleFingerings}
            showShifts={showScaleShifts}
          />
          <div className="fretboard-legend scale-legend" aria-label="Легенда аппликатуры">
            <span><i className="legend-dot legend-dot--root" /> тоника</span>
            <span><i className="legend-dot" /> маршрут</span>
            {showScaleFingerings && <span><i className="legend-finger">1–4</i> пальцы</span>}
            {showScaleShifts && <span><i className="legend-shift" /> смена позиции</span>}
          </div>
          <Tablature
            config={preferences.config}
            locations={selectedPattern.locations}
            events={selectedEvents}
            direction={direction}
            activeStepIndex={activeStepIndex}
            showFingerings={showScaleFingerings}
            showShifts={showScaleShifts}
          />
        </>
      )}
    </section>
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
  const { constraints, config } = preferences
  return (
    <details className="filter-panel">
      <summary>
        <span>Фильтры аппликатур</span>
        <span className="filter-summary">до {constraints.maxSpan} ладов · {constraints.bass === 'root' ? 'тоника в басу' : 'любой бас'}</span>
      </summary>
      <div className="filter-grid">
        <label>
          <span>Растяжение: {constraints.maxSpan} лада</span>
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
          <span>Минимум звучащих струн</span>
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
          <span>Басовая нота</span>
          <select
            value={constraints.bass}
            onChange={(event) =>
              onChange(updateConstraints(preferences, { bass: event.target.value as BassFilter }))
            }
          >
            <option value="any">Любая</option>
            <option value="root">Тоника</option>
            <option value="first">Терция · 1-е обращение</option>
            <option value="second">Квинта · 2-е обращение</option>
            <option value="third">Септима · 3-е обращение</option>
          </select>
        </label>
        <div className="fret-range-control">
          <span>Диапазон ладов</span>
          <div>
            <label>
              от
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
              до
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
          Открытые струны
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={constraints.allowBarre}
            onChange={(event) =>
              onChange(updateConstraints(preferences, { allowBarre: event.target.checked }))
            }
          />
          Разрешить баррэ
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={constraints.allowInnerMutes}
            onChange={(event) =>
              onChange(updateConstraints(preferences, { allowInnerMutes: event.target.checked }))
            }
          />
          Пропуски между струнами
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={preferences.showFingerings}
            onChange={(event) => onChange({ ...preferences, showFingerings: event.target.checked })}
          />
          Показать пальцы и баррэ
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
        <button type="button" onClick={() => playEvents(blockEvents)} aria-label="Сыграть аккорд одновременно">
          <span aria-hidden="true">▶</span> Аккорд
        </button>
        <button type="button" onClick={() => playEvents(arpeggioEvents)} aria-label="Сыграть арпеджио">
          <span aria-hidden="true">≋</span> Арпеджио
        </button>
      </div>
    </article>
  )
}

interface ChordsViewProps {
  harmony: InstrumentWorkspaceProps['harmony']
  preferences: GuitarPreferences
  onPreferencesChange: (preferences: GuitarPreferences) => void
  playEvents: (events: PlayableEvent[]) => void
}

function ChordsView({ harmony, preferences, onPreferencesChange, playEvents }: ChordsViewProps) {
  const [selectedDegree, setSelectedDegree] = useState(1)
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
          <span className="eyebrow">Гармонизация гаммы</span>
          <h3 id="chords-heading">Диатонические аккорды</h3>
        </div>
        <div className="segmented" aria-label="Тип аккорда">
          <button
            type="button"
            className={size === 'triad' ? 'is-active' : ''}
            onClick={() => { setSize('triad'); setVisibleCount(8) }}
          >
            Трезвучия
          </button>
          <button
            type="button"
            className={size === 'seventh' ? 'is-active' : ''}
            onClick={() => { setSize('seventh'); setVisibleCount(8) }}
          >
            Септаккорды
          </button>
        </div>
      </div>

      <div className="chord-picker" role="list" aria-label="Ступени и аккорды тональности">
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
          <span className="eyebrow">{chord.roman} ступень</span>
          <h4>{chord.qualityLabel}</h4>
          <p>{chord.notes.map((note) => `${note.symbol} (${note.solfege})`).join(' · ')}</p>
        </div>
      </div>

      <VoicingFilters preferences={preferences} onChange={onPreferencesChange} />

      <div className="voicing-results-heading">
        <div>
          <h4>Практические аппликатуры</h4>
          <p>{loading ? 'Рассчитываем варианты…' : `Найдено: ${voicings.length}`}</p>
        </div>
      </div>

      {error && <div className="error-callout">{error}</div>}
      {loading ? (
        <div className="voicing-grid" aria-busy="true" aria-label="Расчёт аппликатур">
          {Array.from({ length: 4 }, (_, index) => <div className="voicing-skeleton" key={index} />)}
        </div>
      ) : voicings.length === 0 ? (
        <div className="empty-state">
          <strong>Подходящих форм не найдено.</strong>
          <p>Увеличьте растяжение, разрешите пропуски или расширьте диапазон ладов.</p>
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
              Показать ещё 8 из {voicings.length}
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
}: InstrumentWorkspaceProps) {
  const [preferences, setPreferences] = usePersistentState<GuitarPreferences>(
    'qfc.instrument.electric-guitar.v1',
    structuredClone(DEFAULT_GUITAR_PREFERENCES),
    isGuitarPreferences,
  )
  const synth = useSynth()
  const locations = useMemo(
    () => locateScaleOnFretboard(preferences.config, activeNotes),
    [activeNotes, preferences.config],
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
    [activeNotes, patternOptions, preferences.config, shareState.direction],
  )
  const playMidi = (midi: number) => synth.playMidi(midi, preferences.volume)
  const playEvents = (events: PlayableEvent[]) =>
    synth.playEvents(events, preferences.tempo, preferences.volume)
  const playScale = () =>
    playEvents(scalePlaybackEvents(activeNotes, shareState.direction))

  return (
    <>
      <div className="instrument-meta-row">
        <span>{preferences.config.strings.length} струн</span>
        <span>{preferences.config.frets} лада</span>
        <span>{hasCagedTopology(preferences.config) ? 'CAGED доступен' : 'CAGED недоступен'}</span>
        {!synth.supported && <span>Аудио не поддерживается браузером</span>}
      </div>

      {section === 'notes' && (
        <NotesView
          activeNotes={activeNotes}
          locations={locations}
          preferences={preferences}
          onPreferencesChange={setPreferences}
          direction={shareState.direction}
          playMidi={playMidi}
          playScale={playScale}
        />
      )}
      {section === 'scales' && (
        <ScalesView
          patterns={patterns}
          preferences={preferences}
          onPreferencesChange={setPreferences}
          direction={shareState.direction}
          playMidi={playMidi}
          playEvents={playEvents}
          tonicSymbol={activeNotes[0]?.symbol ?? ''}
        />
      )}
      {section === 'chords' && (
        <ChordsView
          harmony={harmony}
          preferences={preferences}
          onPreferencesChange={setPreferences}
          playEvents={playEvents}
        />
      )}

      {settingsOpen && (
        <GuitarSettings
          preferences={preferences}
          onChange={setPreferences}
          onClose={onCloseSettings}
        />
      )}
    </>
  )
}
