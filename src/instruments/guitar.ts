import type { ChordDefinition, ScaleDirection, ScaleNote } from '../music/types'
import { formatPitchClass, mod } from '../music/theory'
import type {
  FretLocation,
  InstrumentModule,
  PerformancePattern,
  PlayableEvent,
} from './types'
import type { FrettedInstrumentSpec } from './fretted'
import {
  CANONICAL_CAGED_TEMPLATES,
  CANONICAL_THREE_NPS_TEMPLATES,
} from './guitarScaleTemplates'
import { pick } from '../i18n'
import {
  makeAllScalePatterns,
  standardSixStringOffset as findStandardSixStringOffset,
} from './guitarScalePatterns'

export {
  makeCanonicalCagedPatterns as generateCuratedCagedPatterns,
  makeExtendedPatterns as generateExtendedScalePatterns,
  makeOneOctavePatterns as generateOneOctavePatterns,
  makePositionalPatterns as generatePositionalPatterns,
  makeThreeNpsPatterns as generateCuratedThreeNpsPatterns,
  makeTwoOctaveHybridPatterns as generateTwoOctaveHybridPatterns,
  groupScalePatternsForDisplay,
  rankScalePatterns,
  scalePatternConstructionKey,
  standardSixStringOffset,
} from './guitarScalePatterns'

export type Handedness = 'right' | 'left'

export interface GuitarConfig {
  strings: number[]
  frets: number
  handedness: Handedness
  presetId: string
}

export interface GuitarPreset {
  id: string
  name: string
  strings: number[]
}

export interface Barre {
  fret: number
  fromString: number
  toString: number
  finger: number
}

export type BassFilter = 'any' | 'root' | 'first' | 'second' | 'third'

export interface VoicingConstraints {
  maxSpan: number
  maxFingerActions: number
  minSoundingStrings: number
  allowOpen: boolean
  allowBarre: boolean
  allowInnerMutes: boolean
  bass: BassFilter
  fretFrom: number
  fretTo: number
}

export interface GuitarVoicing {
  id: string
  frets: number[]
  midis: Array<number | null>
  fingers: Array<number | null>
  barres: Barre[]
  bassPitchClass: number
  inversionLabel: string
  position: number
  span: number
  score: number
}

export interface GenerateVoicingsRequest {
  config: GuitarConfig
  chord: ChordDefinition
  constraints: VoicingConstraints
}

export type FretboardLabelMode = 'notes' | 'degrees'
export type ScaleReachProfile = 'compact' | 'balanced' | 'stretch'
export type PlayerLevel = 'beginner' | 'intermediate' | 'advanced'
export type HandSize = 'small' | 'medium' | 'large'

export interface ScaleGenerationOptions {
  reachProfile: ScaleReachProfile
  playerLevel: PlayerLevel
  handSize: HandSize
}

export interface GuitarPreferences {
  version: 1
  config: GuitarConfig
  constraints: VoicingConstraints
  showFingerings: boolean
  showScaleFingerings?: boolean
  showScaleShifts?: boolean
  fretboardLabels: FretboardLabelMode
  tempo: number
  volume: number
  scaleReachProfile?: ScaleReachProfile
  playerLevel?: PlayerLevel
  handSize?: HandSize
}

export const GUITAR_PRESETS: GuitarPreset[] = [
  { id: '6-standard-e', name: 'E Standard', strings: [40, 45, 50, 55, 59, 64] },
  { id: '6-drop-d', name: 'Drop D', strings: [38, 45, 50, 55, 59, 64] },
  { id: '6-standard-d', name: 'D Standard', strings: [38, 43, 48, 53, 57, 62] },
  { id: '6-drop-c', name: 'Drop C', strings: [36, 43, 48, 53, 57, 62] },
  { id: '7-standard-b', name: 'B Standard', strings: [35, 40, 45, 50, 55, 59, 64] },
  { id: '7-drop-a', name: 'Drop A', strings: [33, 40, 45, 50, 55, 59, 64] },
  { id: '8-standard-fs', name: 'F♯ Standard', strings: [30, 35, 40, 45, 50, 55, 59, 64] },
  { id: '8-drop-e', name: 'Drop E', strings: [28, 35, 40, 45, 50, 55, 59, 64] },
]

export function presetLabel(preset: GuitarPreset): string {
  return `${preset.strings.length} ${pick('струн', 'strings')} · ${preset.name}`
}

export const DEFAULT_GUITAR_CONFIG: GuitarConfig = {
  strings: [...(GUITAR_PRESETS[0]?.strings ?? [40, 45, 50, 55, 59, 64])],
  frets: 24,
  handedness: 'right',
  presetId: '6-standard-e',
}

export const DEFAULT_VOICING_CONSTRAINTS: VoicingConstraints = {
  maxSpan: 4,
  maxFingerActions: 4,
  minSoundingStrings: 3,
  allowOpen: true,
  allowBarre: true,
  allowInnerMutes: false,
  bass: 'root',
  fretFrom: 0,
  fretTo: 24,
}

export const DEFAULT_GUITAR_PREFERENCES: GuitarPreferences = {
  version: 1,
  config: DEFAULT_GUITAR_CONFIG,
  constraints: DEFAULT_VOICING_CONSTRAINTS,
  showFingerings: true,
  showScaleFingerings: true,
  showScaleShifts: true,
  fretboardLabels: 'notes',
  tempo: 96,
  volume: 0.65,
  scaleReachProfile: 'balanced',
  playerLevel: 'intermediate',
  handSize: 'medium',
}

export function scaleGenerationOptions(
  preferences: GuitarPreferences,
): ScaleGenerationOptions {
  return {
    reachProfile: preferences.scaleReachProfile ?? 'balanced',
    playerLevel: preferences.playerLevel ?? 'intermediate',
    handSize: preferences.handSize ?? 'medium',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isGuitarConfig(
  value: unknown,
  minStrings = 6,
  maxStrings = 8,
): value is GuitarConfig {
  if (!isRecord(value) || !Array.isArray(value.strings)) return false
  return (
    value.strings.length >= minStrings &&
    value.strings.length <= maxStrings &&
    value.strings.every((midi) => Number.isInteger(midi) && midi >= 12 && midi <= 96) &&
    Number.isInteger(value.frets) &&
    Number(value.frets) >= 12 &&
    Number(value.frets) <= 24 &&
    (value.handedness === 'right' || value.handedness === 'left') &&
    typeof value.presetId === 'string'
  )
}

export function isVoicingConstraints(value: unknown): value is VoicingConstraints {
  if (!isRecord(value)) return false
  return (
    Number.isInteger(value.maxSpan) &&
    Number(value.maxSpan) >= 3 &&
    Number(value.maxSpan) <= 6 &&
    Number.isInteger(value.maxFingerActions) &&
    Number(value.maxFingerActions) >= 1 &&
    Number(value.maxFingerActions) <= 4 &&
    Number.isInteger(value.minSoundingStrings) &&
    Number(value.minSoundingStrings) >= 3 &&
    typeof value.allowOpen === 'boolean' &&
    typeof value.allowBarre === 'boolean' &&
    typeof value.allowInnerMutes === 'boolean' &&
    ['any', 'root', 'first', 'second', 'third'].includes(String(value.bass)) &&
    Number.isInteger(value.fretFrom) &&
    Number.isInteger(value.fretTo)
  )
}

export function isGuitarPreferences(
  value: unknown,
  minStrings = 6,
  maxStrings = 8,
): value is GuitarPreferences {
  if (!isRecord(value)) return false
  return (
    value.version === 1 &&
    isGuitarConfig(value.config, minStrings, maxStrings) &&
    isVoicingConstraints(value.constraints) &&
    typeof value.showFingerings === 'boolean' &&
    (value.showScaleFingerings === undefined || typeof value.showScaleFingerings === 'boolean') &&
    (value.showScaleShifts === undefined || typeof value.showScaleShifts === 'boolean') &&
    (value.fretboardLabels === 'notes' || value.fretboardLabels === 'degrees') &&
    typeof value.tempo === 'number' &&
    value.tempo >= 40 &&
    value.tempo <= 240 &&
    typeof value.volume === 'number' &&
    value.volume >= 0 &&
    value.volume <= 1 &&
    (value.scaleReachProfile === undefined ||
      ['compact', 'balanced', 'stretch'].includes(String(value.scaleReachProfile))) &&
    (value.playerLevel === undefined ||
      ['beginner', 'intermediate', 'advanced'].includes(String(value.playerLevel))) &&
    (value.handSize === undefined ||
      ['small', 'medium', 'large'].includes(String(value.handSize)))
  )
}

export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1
}

export function formatOpenString(midi: number): string {
  return `${formatPitchClass(mod(midi), 'sharp')}${midiToOctave(midi)}`
}

export function locateScaleOnFretboard(config: GuitarConfig, notes: ScaleNote[]): FretLocation[] {
  const notesByPitch = new Map(notes.map((note) => [note.pitchClass, note]))
  const locations: FretLocation[] = []

  config.strings.forEach((openMidi, stringIndex) => {
    for (let fret = 0; fret <= config.frets; fret += 1) {
      const midi = openMidi + fret
      const pitchClass = mod(midi)
      const note = notesByPitch.get(pitchClass)
      if (!note) continue
      locations.push({
        kind: 'fret',
        id: `s${stringIndex}-f${fret}`,
        stringIndex,
        fret,
        midi,
        pitchClass,
        degree: note.degree,
        note,
      })
    }
  })
  return locations
}

function eventsFromPath(locations: FretLocation[]): PlayableEvent[] {
  return locations.map((location, index) => ({
    midi: location.midi,
    startBeat: index * 0.5,
    durationBeats: 0.45,
    locationId: location.id,
  }))
}

interface TonicPathState {
  location: FretLocation
  path: FretLocation[]
  cost: number
}

function pathTransitionCost(previous: FretLocation, current: FretLocation): number {
  const stringMove = current.stringIndex - previous.stringIndex
  const fretMove = Math.abs(current.fret - previous.fret)
  const backwardsPenalty = stringMove < 0 ? 36 : 0
  const wideShiftPenalty = fretMove > 5 ? (fretMove - 5) * 8 : 0
  return fretMove * 1.4 + Math.abs(stringMove) * 2 + backwardsPenalty + wideShiftPenalty
}

function findTonicPathForOctaves(
  locations: FretLocation[],
  notes: ScaleNote[],
  octaveCount: number,
): FretLocation[] {
  const tonic = notes[0]
  if (!tonic || notes.length === 0) return []
  const degreeOffsets = Array.from({ length: octaveCount }, (_, octaveIndex) =>
    notes.map((note) => note.interval + octaveIndex * 12),
  ).flat()
  degreeOffsets.push(octaveCount * 12)
  const roots = locations.filter((location) => location.pitchClass === tonic.pitchClass)
  const completePaths: TonicPathState[] = []

  roots.forEach((root) => {
    const candidatesByDegree = degreeOffsets.map((offset, degreeIndex) => {
      if (degreeIndex === 0) return [root]
      return locations.filter((location) => location.midi === root.midi + offset)
    })
    if (candidatesByDegree.some((candidates) => candidates.length === 0)) return

    let states: TonicPathState[] = [{ location: root, path: [root], cost: 0 }]
    for (let degreeIndex = 1; degreeIndex < candidatesByDegree.length; degreeIndex += 1) {
      const candidates = candidatesByDegree[degreeIndex] ?? []
      const nextStates: TonicPathState[] = []
      candidates.forEach((candidate) => {
        const bestPrevious = states
          .map((state) => ({
            state,
            cost: state.cost + pathTransitionCost(state.location, candidate),
          }))
          .sort((a, b) => a.cost - b.cost)[0]
        if (!bestPrevious) return
        nextStates.push({
          location: candidate,
          path: [...bestPrevious.state.path, candidate],
          cost: bestPrevious.cost,
        })
      })
      states = nextStates
    }
    completePaths.push(...states)
  })

  const best = completePaths.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost
    return (a.path[0]?.midi ?? 0) - (b.path[0]?.midi ?? 0)
  })[0]
  return best?.path ?? []
}

export function findTonicToTonicPath(
  locations: FretLocation[],
  notes: ScaleNote[],
): FretLocation[] {
  const twoOctavePath = findTonicPathForOctaves(locations, notes, 2)
  if (twoOctavePath.length === notes.length * 2 + 1) return twoOctavePath
  return findTonicPathForOctaves(locations, notes, 1)
}

export function hasCagedTopology(config: GuitarConfig): boolean {
  return findStandardSixStringOffset(config) !== null
}

interface DynamicScaleWindow {
  startFret: number
  endFret: number
  locations: FretLocation[]
  tonicPath: FretLocation[]
}

function findDynamicScaleWindow(
  allLocations: FretLocation[],
  config: GuitarConfig,
  notes: ScaleNote[],
  baseStartFret: number,
  baseEndFret: number,
): DynamicScaleWindow {
  const makeWindow = (startFret: number, endFret: number): DynamicScaleWindow => {
    const locations = allLocations.filter(
      (location) => location.fret >= startFret && location.fret <= endFret,
    )
    return {
      startFret,
      endFret,
      locations,
      tonicPath: findTonicToTonicPath(locations, notes),
    }
  }
  const fallback = makeWindow(baseStartFret, baseEndFret)
  if (fallback.tonicPath.length === notes.length * 2 + 1) return fallback

  const visited = new Set([`${baseStartFret}:${baseEndFret}`])
  for (let expansion = 1; expansion <= config.frets; expansion += 1) {
    for (let leftExpansion = 0; leftExpansion <= expansion; leftExpansion += 1) {
      const rightExpansion = expansion - leftExpansion
      const startFret = Math.max(0, baseStartFret - leftExpansion)
      const endFret = Math.min(config.frets, baseEndFret + rightExpansion)
      const key = `${startFret}:${endFret}`
      if (visited.has(key)) continue
      visited.add(key)
      const window = makeWindow(startFret, endFret)
      if (window.tonicPath.length === notes.length * 2 + 1) return window
    }
  }

  return fallback
}

function firstFretForPitch(openMidi: number, pitchClass: number): number {
  return mod(pitchClass - mod(openMidi))
}

export function generateCanonicalCagedPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
): PerformancePattern<FretLocation>[] {
  if (!hasCagedTopology(config) || notes.length === 0) return []
  const allLocations = locateScaleOnFretboard(config, notes)
  const tonicPitchClass = notes[0]?.pitchClass ?? 0

  return CANONICAL_CAGED_TEMPLATES.flatMap((template) => {
    const openMidi = config.strings[template.anchorString] ?? 40
    const firstRootFret = firstFretForPitch(openMidi, tonicPitchClass)
    const rootFrets: number[] = []
    for (let rootFret = firstRootFret; rootFret <= config.frets; rootFret += 12) {
      rootFrets.push(rootFret)
    }

    const candidate = rootFrets.flatMap((rootFret) => {
      const startFret = Math.max(0, rootFret + template.startOffset)
      const endFret = Math.min(config.frets, rootFret + template.endOffset)
      if (endFret < startFret) return []
      const locations = allLocations.filter(
        (location) => location.fret >= startFret && location.fret <= endFret,
      )
      const tonicPath = findTonicToTonicPath(locations, notes)
      if (tonicPath.length < notes.length + 1) return []
      return [{ startFret, endFret, locations, tonicPath }]
    })[0]
    if (!candidate) return []

    return [{
      id: `canonical-caged-${template.id}-${candidate.startFret}`,
      name: pick(`Форма ${template.name}`, `Shape ${template.name}`),
      description: pick('Классический компактный CAGED-box', 'Classic compact CAGED box'),
      system: 'caged',
      locations: candidate.locations,
      ascending: eventsFromPath(candidate.tonicPath),
      descending: eventsFromPath([...candidate.tonicPath].reverse()),
      startPosition: candidate.startFret,
      endPosition: candidate.endFret,
      origin: 'canonical',
      tags: [pick('Популярная', 'Popular'), pick('Компактная', 'Compact'), 'CAGED box'],
    }]
  })
}

function scaleOffsetFromDegree(
  notes: ScaleNote[],
  startDegree: number,
  step: number,
): number | null {
  const startNote = notes[startDegree]
  const note = notes[(startDegree + step) % notes.length]
  if (!startNote || !note) return null
  const octave = Math.floor((startDegree + step) / notes.length)
  return note.interval + octave * 12 - startNote.interval
}

export function generateCanonicalThreeNpsPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
): PerformancePattern<FretLocation>[] {
  if (!hasCagedTopology(config) || notes.length !== 7) return []
  const allLocations = locateScaleOnFretboard(config, notes)
  const locationByPosition = new Map(
    allLocations.map((location) => [`${location.stringIndex}:${location.fret}`, location]),
  )
  const lowString = config.strings[0] ?? 40

  return CANONICAL_THREE_NPS_TEMPLATES.flatMap((template) => {
    const degreeNote = notes[template.startDegree]
    if (!degreeNote) return []
    const firstAnchorFret = firstFretForPitch(lowString, degreeNote.pitchClass)
    const anchorFrets: number[] = []
    for (let anchorFret = firstAnchorFret; anchorFret <= config.frets; anchorFret += 12) {
      anchorFrets.push(anchorFret)
    }

    const candidate = anchorFrets.flatMap((anchorFret) => {
      const startMidi = lowString + anchorFret
      const locations: FretLocation[] = []
      for (let stringIndex = 0; stringIndex < config.strings.length; stringIndex += 1) {
        const openMidi = config.strings[stringIndex]
        if (openMidi === undefined) return []
        for (let noteOnString = 0; noteOnString < 3; noteOnString += 1) {
          const step = stringIndex * 3 + noteOnString
          const offset = scaleOffsetFromDegree(notes, template.startDegree, step)
          if (offset === null) return []
          const fret = startMidi + offset - openMidi
          const location = locationByPosition.get(`${stringIndex}:${fret}`)
          if (!location || fret < 0 || fret > config.frets) return []
          locations.push(location)
        }
      }
      const tonicPath = findTonicToTonicPath(locations, notes)
      if (tonicPath.length < notes.length + 1) return []
      const frets = locations.map((location) => location.fret)
      return [{
        locations,
        tonicPath,
        startFret: Math.min(...frets),
        endFret: Math.max(...frets),
      }]
    })[0]
    if (!candidate) return []

    return [{
      id: `canonical-3nps-${template.id}-${candidate.startFret}`,
      name: pick(`Позиция ${template.position} · ${degreeNote.symbol}`, `Position ${template.position} · ${degreeNote.symbol}`),
      description: pick('Классическая последовательная 3NPS-форма', 'Classic sequential 3NPS shape'),
      system: '3nps',
      locations: candidate.locations,
      ascending: eventsFromPath(candidate.tonicPath),
      descending: eventsFromPath([...candidate.tonicPath].reverse()),
      startPosition: candidate.startFret,
      endPosition: candidate.endFret,
      origin: 'canonical',
      tags: [pick('Популярная', 'Popular'), pick('3 ноты/струна', '3 notes/string'), pick('Последовательная', 'Sequential')],
    }]
  })
}

export function generateCagedPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
): PerformancePattern<FretLocation>[] {
  if (!hasCagedTopology(config) || notes.length === 0) return []
  const allLocations = locateScaleOnFretboard(config, notes)
  const tonicPitch = notes[0]?.pitchClass ?? 0
  const formSpecs = [
    { name: 'C', stringIndex: 1, rootOffset: 3 },
    { name: 'A', stringIndex: 1, rootOffset: 0 },
    { name: 'G', stringIndex: 0, rootOffset: 3 },
    { name: 'E', stringIndex: 0, rootOffset: 0 },
    { name: 'D', stringIndex: 2, rootOffset: 0 },
  ]

  return formSpecs.flatMap((spec) => {
    const openMidi = config.strings[spec.stringIndex] ?? 40
    const rootFret = firstFretForPitch(openMidi, tonicPitch)
    const baseStartFret = mod(rootFret - spec.rootOffset)
    const baseEndFret = Math.min(config.frets, baseStartFret + 4)
    const window = findDynamicScaleWindow(
      allLocations,
      config,
      notes,
      baseStartFret,
      baseEndFret,
    )
    const { startFret, endFret, locations, tonicPath } = window
    if (![notes.length + 1, notes.length * 2 + 1].includes(tonicPath.length)) return []
    return [{
      id: `caged-${spec.name.toLowerCase()}-${startFret}`,
      name: pick(`Форма ${spec.name}`, `Shape ${spec.name}`),
      description: pick(
        `Расширенная CAGED-позиция ${startFret === 0 ? 'у порожка' : `от ${startFret} лада`}`,
        `Extended CAGED position ${startFret === 0 ? 'at the nut' : `from fret ${startFret}`}`,
      ),
      system: 'caged',
      locations,
      ascending: eventsFromPath(tonicPath),
      descending: eventsFromPath([...tonicPath].reverse()),
      startPosition: startFret,
      endPosition: endFret,
      origin: 'generated',
      tags: [pick('Сгенерированная', 'Generated'), pick('Две октавы', 'Two octaves'), pick('Динамический диапазон', 'Dynamic range')],
    }]
  })
}

function consecutiveTrios(locations: FretLocation[]): FretLocation[][] {
  if (locations.length < 3) return []
  const result: FretLocation[][] = []
  for (let index = 0; index <= locations.length - 3; index += 1) {
    result.push(locations.slice(index, index + 3))
  }
  return result
}

interface ThreeNpsCandidate {
  startFret: number
  endFret: number
  locations: FretLocation[]
  score: number
}

interface ThreeNpsTrio {
  locations: FretLocation[]
  averageFret: number
  averageMidi: number
  routeMask: number
}

interface ThreeNpsSearchState {
  locations: FretLocation[]
  routeMask: number
  minFret: number
  maxFret: number
  previousAverage: number
  movement: number
}

function countBits(value: number): number {
  let count = 0
  let remainder = value
  while (remainder > 0) {
    count += remainder & 1
    remainder >>>= 1
  }
  return count
}

function countCoveredPrefix(mask: number, targetCount: number): number {
  let count = 0
  while (count < targetCount && (mask & (1 << count)) !== 0) count += 1
  return count
}

function makeThreeNpsCandidate(
  allLocations: FretLocation[],
  config: GuitarConfig,
  notes: ScaleNote[],
  anchorFret: number,
  tonicMidi: number,
  octaveCount: number,
): ThreeNpsCandidate | null {
  const routeOffsets = Array.from({ length: octaveCount }, (_, octaveIndex) =>
    notes.map((note) => note.interval + octaveIndex * 12),
  ).flat()
  routeOffsets.push(octaveCount * 12)
  const routeMidis = routeOffsets.map((offset) => tonicMidi + offset)
  const routeIndexByMidi = new Map(routeMidis.map((midi, index) => [midi, index]))
  const fullRouteMask = (1 << routeMidis.length) - 1
  let states: ThreeNpsSearchState[] = [{
    locations: [],
    routeMask: 0,
    minFret: config.frets,
    maxFret: 0,
    previousAverage: anchorFret,
    movement: 0,
  }]

  for (let stringIndex = 0; stringIndex < config.strings.length; stringIndex += 1) {
    const onString = allLocations
      .filter((location) => location.stringIndex === stringIndex)
      .sort((a, b) => a.fret - b.fret)
    const allTrios: ThreeNpsTrio[] = consecutiveTrios(onString)
      .filter((trio) => stringIndex !== 0 || trio[0]?.fret === anchorFret)
      .map((locations) => ({
        locations,
        averageFret: locations.reduce((sum, item) => sum + item.fret, 0) / locations.length,
        averageMidi: locations.reduce((sum, item) => sum + item.midi, 0) / locations.length,
        routeMask: locations.reduce((mask, location) => {
          const routeIndex = routeIndexByMidi.get(location.midi)
          return routeIndex === undefined ? mask : mask | (1 << routeIndex)
        }, 0),
      }))
    if (allTrios.length === 0) return null

    const coveringTrios = allTrios.filter((trio) => trio.routeMask !== 0)
    const closestOutsideTrio = allTrios
      .filter((trio) => trio.routeMask === 0)
      .sort((a, b) => {
        const routeMiddleMidi = tonicMidi + octaveCount * 6
        return Math.abs(a.averageMidi - routeMiddleMidi) - Math.abs(b.averageMidi - routeMiddleMidi)
      })[0]
    const trios = stringIndex === 0
      ? allTrios
      : [...coveringTrios, ...(closestOutsideTrio ? [closestOutsideTrio] : [])]
    const nextStates = new Map<string, ThreeNpsSearchState>()

    states.forEach((state) => {
      trios.forEach((trio) => {
        const trioFrets = trio.locations.map((location) => location.fret)
        const minFret = Math.min(state.minFret, ...trioFrets)
        const maxFret = Math.max(state.maxFret, ...trioFrets)
        const routeMask = state.routeMask | trio.routeMask
        const movement = state.movement + Math.abs(trio.averageFret - state.previousAverage)
        const nextState: ThreeNpsSearchState = {
          locations: [...state.locations, ...trio.locations],
          routeMask,
          minFret,
          maxFret,
          previousAverage: trio.averageFret,
          movement,
        }
        const key = `${routeMask}:${minFret}:${maxFret}:${Math.round(trio.averageFret * 3)}`
        const existing = nextStates.get(key)
        if (!existing || nextState.movement < existing.movement) nextStates.set(key, nextState)
      })
    })

    states = [...nextStates.values()]
    if (states.length > 150) {
      states = states
        .sort((a, b) => {
          const prefixDifference =
            countCoveredPrefix(b.routeMask, routeMidis.length) -
            countCoveredPrefix(a.routeMask, routeMidis.length)
          if (prefixDifference !== 0) return prefixDifference
          const coverageDifference = countBits(b.routeMask) - countBits(a.routeMask)
          if (coverageDifference !== 0) return coverageDifference
          const spanDifference = (a.maxFret - a.minFret) - (b.maxFret - b.minFret)
          if (spanDifference !== 0) return spanDifference
          return a.movement - b.movement
        })
        .slice(0, 150)
    }
  }

  const best = states
    .filter((state) => state.routeMask === fullRouteMask)
    .sort((a, b) => {
      const spanDifference = (a.maxFret - a.minFret) - (b.maxFret - b.minFret)
      if (spanDifference !== 0) return spanDifference
      return a.movement - b.movement
    })[0]
  if (!best) return null

  const startFret = best.minFret
  const endFret = best.maxFret
  const span = endFret - startFret
  return {
    startFret,
    endFret,
    locations: best.locations,
    score: span * 100 + best.movement * 10,
  }
}

export function generateThreeNpsPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
): PerformancePattern<FretLocation>[] {
  if (notes.length === 0) return []
  const allLocations = locateScaleOnFretboard(config, notes)
  const lowString = config.strings[0] ?? 40
  const tonicPitchClass = notes[0]?.pitchClass ?? 0
  const allTonicMidis = [...new Set(
    allLocations
      .filter((location) => location.pitchClass === tonicPitchClass)
      .map((location) => location.midi),
  )].sort((a, b) => a - b)
  const highestPlayableMidi = Math.max(
    ...config.strings.map((openMidi) => openMidi + config.frets),
  )

  return notes.flatMap((degreeNote, degreeIndex) => {
    const baseAnchor = firstFretForPitch(lowString, degreeNote.pitchClass)
    const anchors = [baseAnchor, baseAnchor + 12].filter((fret) => fret <= config.frets)
    const buildCandidates = (octaveCount: number) => anchors.flatMap((anchorFret) =>
      allTonicMidis
        .filter((tonicMidi) => tonicMidi + octaveCount * 12 <= highestPlayableMidi)
        .flatMap((tonicMidi) => {
          const candidate = makeThreeNpsCandidate(
            allLocations,
            config,
            notes,
            anchorFret,
            tonicMidi,
            octaveCount,
          )
          return candidate ? [candidate] : []
        }),
    )
    const twoOctaveCandidates = buildCandidates(2)
    const candidates = twoOctaveCandidates.length > 0 ? twoOctaveCandidates : buildCandidates(1)
    const best = candidates.sort((a, b) => a.score - b.score)[0]
    if (!best) return []
    const tonicPath = findTonicToTonicPath(best.locations, notes)
    if (![notes.length + 1, notes.length * 2 + 1].includes(tonicPath.length)) return []
    return [
      {
        id: `3nps-${degreeIndex + 1}-${best.startFret}`,
        name: pick(`Позиция ${degreeIndex + 1} · ${degreeNote.symbol}`, `Position ${degreeIndex + 1} · ${degreeNote.symbol}`),
        description: pick(
          `Динамическая 3NPS-форма, ${best.startFret}–${best.endFret} лады`,
          `Dynamic 3NPS shape, frets ${best.startFret}–${best.endFret}`,
        ),
        system: '3nps',
        locations: best.locations,
        ascending: eventsFromPath(tonicPath),
        descending: eventsFromPath([...tonicPath].reverse()),
        startPosition: best.startFret,
        endPosition: best.endFret,
        origin: 'generated',
        tags: [pick('Сгенерированная', 'Generated'), pick('3 ноты/струна', '3 notes/string'), pick('Динамический диапазон', 'Dynamic range')],
      },
    ]
  })
}

export function generateGuitarPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
  _direction: ScaleDirection,
  options: ScaleGenerationOptions = {
    reachProfile: 'balanced',
    playerLevel: 'intermediate',
    handSize: 'medium',
  },
): PerformancePattern<FretLocation>[] {
  void _direction
  return makeAllScalePatterns(config, notes, options)
}

function bassTarget(chord: ChordDefinition, bass: BassFilter): number | null {
  if (bass === 'any') return null
  const targetIndex = bass === 'root' ? 0 : bass === 'first' ? 1 : bass === 'second' ? 2 : 3
  return chord.pitchClasses[targetIndex] ?? null
}

function hasInnerMute(frets: number[]): boolean {
  const sounding = frets.map((fret, index) => (fret >= 0 ? index : -1)).filter((index) => index >= 0)
  const first = sounding[0]
  const last = sounding.at(-1)
  if (first === undefined || last === undefined) return false
  return frets.slice(first, last + 1).some((fret) => fret < 0)
}

interface FingeringResult {
  fingers: Array<number | null>
  barres: Barre[]
  actions: number
}

function assignFingers(frets: number[], allowBarre: boolean): FingeringResult {
  const fingers: Array<number | null> = frets.map((fret) => (fret > 0 ? 0 : null))
  const barres: Barre[] = []
  const handled = new Set<number>()
  const frettedValues = [...new Set(frets.filter((fret) => fret > 0))].sort((a, b) => a - b)
  let nextFinger = 1

  frettedValues.forEach((fret) => {
    const stringIndexes = frets
      .map((value, index) => (value === fret ? index : -1))
      .filter((index) => index >= 0)
    const first = stringIndexes[0]
    const last = stringIndexes.at(-1)
    const canBarre =
      allowBarre &&
      stringIndexes.length >= 2 &&
      first !== undefined &&
      last !== undefined &&
      frets.slice(first, last + 1).every((value) => value === -1 || value >= fret)

    if (canBarre && first !== undefined && last !== undefined) {
      const finger = Math.min(nextFinger, 4)
      barres.push({ fret, fromString: first, toString: last, finger })
      stringIndexes.forEach((index) => {
        fingers[index] = finger
        handled.add(index)
      })
      nextFinger += 1
    }
  })

  frets.forEach((fret, index) => {
    if (fret <= 0 || handled.has(index)) return
    fingers[index] = Math.min(nextFinger, 4)
    nextFinger += 1
  })

  return { fingers, barres, actions: nextFinger - 1 }
}

function inversionLabel(chord: ChordDefinition, bassPitchClass: number): string {
  const index = chord.pitchClasses.indexOf(bassPitchClass)
  if (index <= 0) return pick('Основной вид', 'Root position')
  if (index === 1) return pick('1-е обращение', '1st inversion')
  if (index === 2) return pick('2-е обращение', '2nd inversion')
  return pick('3-е обращение', '3rd inversion')
}

function scoreVoicing(
  frets: number[],
  span: number,
  fingering: FingeringResult,
  bassPitchClass: number,
  rootPitchClass: number,
): number {
  const fretted = frets.filter((fret) => fret > 0)
  const position = fretted.length > 0 ? Math.min(...fretted) : 0
  const openCount = frets.filter((fret) => fret === 0).length
  const mutedCount = frets.filter((fret) => fret < 0).length
  return (
    span * 30 +
    fingering.actions * 18 +
    position * 1.5 +
    mutedCount * 6 -
    openCount * 4 +
    (bassPitchClass === rootPitchClass ? -14 : 0)
  )
}

function voicingIsComplete(chord: ChordDefinition, pitchClasses: Set<number>): boolean {
  return chord.requiredPitchClasses.every((pitch) => pitchClasses.has(pitch))
}

export function generateVoicings({
  config,
  chord,
  constraints,
}: GenerateVoicingsRequest): GuitarVoicing[] {
  const chordPitches = new Set(chord.pitchClasses)
  const targetBass = bassTarget(chord, constraints.bass)
  const results = new Map<string, GuitarVoicing>()
  const maxFret = Math.min(config.frets, constraints.fretTo)

  for (let windowStart = Math.max(1, constraints.fretFrom); windowStart <= maxFret; windowStart += 1) {
    const windowEnd = Math.min(maxFret, windowStart + constraints.maxSpan)
    const candidates = config.strings.map((openMidi) => {
      const values = [-1]
      if (constraints.allowOpen && constraints.fretFrom === 0 && chordPitches.has(mod(openMidi))) {
        values.push(0)
      }
      for (let fret = windowStart; fret <= windowEnd; fret += 1) {
        if (chordPitches.has(mod(openMidi + fret))) values.push(fret)
      }
      return values
    })
    const current = new Array<number>(config.strings.length).fill(-1)

    const visit = (stringIndex: number): void => {
      if (stringIndex === candidates.length) {
        const soundingCount = current.filter((fret) => fret >= 0).length
        if (soundingCount < constraints.minSoundingStrings) return
        if (!constraints.allowInnerMutes && hasInnerMute(current)) return

        const fretted = current.filter((fret) => fret > 0)
        const span = fretted.length > 0 ? Math.max(...fretted) - Math.min(...fretted) : 0
        if (span > constraints.maxSpan) return

        const midis = current.map((fret, index) =>
          fret >= 0 ? (config.strings[index] ?? 40) + fret : null,
        )
        const soundingMidis = midis.filter((midi): midi is number => midi !== null)
        if (soundingMidis.length === 0) return
        const presentPitches = new Set(soundingMidis.map((midi) => mod(midi)))
        if (!voicingIsComplete(chord, presentPitches)) return

        const bassMidi = Math.min(...soundingMidis)
        const bassPitchClass = mod(bassMidi)
        if (targetBass !== null && bassPitchClass !== targetBass) return

        const fingering = assignFingers(current, constraints.allowBarre)
        if (fingering.actions > constraints.maxFingerActions) return
        const key = current.join(',')
        if (results.has(key)) return
        const position = fretted.length > 0 ? Math.min(...fretted) : 0
        results.set(key, {
          id: `v-${key.replaceAll(',', '_')}`,
          frets: [...current],
          midis,
          fingers: fingering.fingers,
          barres: fingering.barres,
          bassPitchClass,
          inversionLabel: inversionLabel(chord, bassPitchClass),
          position,
          span,
          score: scoreVoicing(current, span, fingering, bassPitchClass, chord.root.pitchClass),
        })
        return
      }

      const stringCandidates = candidates[stringIndex] ?? [-1]
      stringCandidates.forEach((fret) => {
        current[stringIndex] = fret
        visit(stringIndex + 1)
      })
    }

    visit(0)
  }

  return [...results.values()].sort((a, b) => a.score - b.score)
}

export function voicingToEvents(voicing: GuitarVoicing): PlayableEvent[] {
  return voicing.midis.flatMap((midi, index) =>
    midi === null
      ? []
      : [{ midi, startBeat: 0, durationBeats: 1.6, locationId: `voicing-string-${index}` }],
  )
}

function fallbackChordEvents(_config: GuitarConfig, chord: ChordDefinition): PlayableEvent[] {
  let previousMidi = 47
  return chord.pitchClasses.map((pitchClass) => {
    let midi = 48 + mod(pitchClass)
    while (midi <= previousMidi) midi += 12
    previousMidi = midi
    return { midi, startBeat: 0, durationBeats: 1.5 }
  })
}

export const guitarModule: InstrumentModule<GuitarConfig> = {
  id: 'electric-guitar',
  get label() {
    return pick('Гитара', 'Guitar')
  },
  family: 'fretted-strings',
  capabilities: {
    fretboard: true,
    tablature: true,
    chordDiagrams: true,
    keyboard: false,
    fingerings: true,
  },
  defaultConfig: DEFAULT_GUITAR_CONFIG,
  validateConfig: (value): value is GuitarConfig => isGuitarConfig(value),
  locateScale: locateScaleOnFretboard,
  generatePatterns: generateGuitarPatterns,
  getChordEvents: fallbackChordEvents,
}

/** Reusable fretted chord-event fallback for other fretted instruments (bass). */
export function frettedChordEvents(config: GuitarConfig, chord: ChordDefinition): PlayableEvent[] {
  return fallbackChordEvents(config, chord)
}

export const guitarSpec: FrettedInstrumentSpec = {
  id: 'electric-guitar',
  presets: GUITAR_PRESETS,
  stringCounts: [6, 7, 8],
  storageKey: 'qfc.instrument.electric-guitar.v1',
  defaultPreferences: DEFAULT_GUITAR_PREFERENCES,
  validatePreferences: (value): value is GuitarPreferences => isGuitarPreferences(value, 6, 8),
}
