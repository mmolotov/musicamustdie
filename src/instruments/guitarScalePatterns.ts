import type { ScaleNote } from '../music/types'
import { mod } from '../music/theory'
import { getLang, pick } from '../i18n'
import type { GuitarConfig, ScaleGenerationOptions } from './guitar'
import {
  CANONICAL_CAGED_TEMPLATES,
  CANONICAL_THREE_NPS_TEMPLATES,
  ONE_OCTAVE_TOPOLOGIES,
  POSITIONAL_SCALE_TEMPLATES,
  TWO_OCTAVE_HYBRID_TOPOLOGIES,
  type ScaleStepGrid,
} from './guitarScaleTemplates'
import type {
  FretLocation,
  FrettingFinger,
  GuitarScaleFamily,
  PatternErgonomics,
  PatternOrigin,
  PatternRoute,
  PatternRouteKind,
  PerformancePattern,
  PlayableEvent,
} from './types'

const DEFAULT_OPTIONS: ScaleGenerationOptions = {
  reachProfile: 'balanced',
  playerLevel: 'intermediate',
  handSize: 'medium',
}

// Octave count with the right word: RU pluralizes (октава/октавы), EN adds -s.
function octaveLabel(count: number): string {
  if (getLang() === 'en') return `${count} octave${count === 1 ? '' : 's'}`
  return `${count} ${count === 1 ? 'октава' : 'октавы'}`
}

// Nth-string label, e.g. "6-й струны" (RU) / "6th string" (EN).
function stringOrdinal(n: number): string {
  if (getLang() === 'en') {
    const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
    return `${n}${suffix} string`
  }
  return `${n}-я струна`
}

type DetectedScaleFamily = 'major' | 'natural-minor' | 'harmonic-minor' | 'melodic-minor' | 'other'

function detectScaleFamily(notes: ScaleNote[]): DetectedScaleFamily {
  const signature = notes.map((note) => note.interval).join(',')
  if (signature === '0,2,4,5,7,9,11') return 'major'
  if (signature === '0,2,3,5,7,8,10') return 'natural-minor'
  if (signature === '0,2,3,5,7,8,11') return 'harmonic-minor'
  if (signature === '0,2,3,5,7,9,11') return 'melodic-minor'
  return 'other'
}

interface RouteSearchOptions {
  root?: FretLocation
  maxNotesPerString?: number
  maxFretSpan?: number
  maxStringAdvance?: number
}

interface RouteState {
  location: FretLocation
  path: FretLocation[]
  minFret: number
  maxFret: number
  notesOnString: number
  cost: number
}

interface PatternBuildOptions {
  id: string
  name: string
  description: string
  family: GuitarScaleFamily
  locations: FretLocation[]
  notes: ScaleNote[]
  origin: PatternOrigin
  tags: string[]
  popularity: number
  generationOptions: ScaleGenerationOptions
  preferredOctaves?: number[]
  includeFullRoute?: boolean
  sourceId?: string
  variantGroupId?: string
  variantId?: string
}

export interface ScalePatternDisplayGroup {
  signature: string
  pattern: PerformancePattern<FretLocation>
  equivalentIds: string[]
  aliasNames: string[]
}

const FLEXIBLE_TWO_OCTAVE_GROUP = 'two-octave-two-three-three-three-four'

function locateScale(config: GuitarConfig, notes: ScaleNote[]): FretLocation[] {
  const notesByPitch = new Map(notes.map((note) => [note.pitchClass, note]))
  return config.strings.flatMap((openMidi, stringIndex) =>
    Array.from({ length: config.frets + 1 }, (_, fret) => {
      const midi = openMidi + fret
      const note = notesByPitch.get(mod(midi))
      return note
        ? [{
            kind: 'fret' as const,
            id: `s${stringIndex}-f${fret}`,
            stringIndex,
            fret,
            midi,
            pitchClass: note.pitchClass,
            degree: note.degree,
            note,
          }]
        : []
    }).flat(),
  )
}

function firstFretForPitch(openMidi: number, pitchClass: number): number {
  return mod(pitchClass - mod(openMidi))
}

/** Returns the highest contiguous EADGBE-style six-string block. */
export function standardSixStringOffset(config: GuitarConfig): number | null {
  for (let offset = config.strings.length - 6; offset >= 0; offset -= 1) {
    const block = config.strings.slice(offset, offset + 6)
    const intervals = block.slice(1).map((midi, index) => midi - (block[index] ?? midi))
    if (intervals.join(',') === '5,5,5,4,5') return offset
  }
  return null
}

function dedupeLocations(locations: FretLocation[]): FretLocation[] {
  return [...new Map(locations.map((location) => [location.id, location])).values()]
}

function fingerSequence(
  frets: number[],
  options: ScaleGenerationOptions = DEFAULT_OPTIONS,
): FrettingFinger[] {
  if (frets.length === 0) return []
  if (frets[0] === 0) {
    const remaining = fingerSequence(frets.slice(1), options)
    return [1, ...remaining]
  }
  if (frets.length === 1) return [1]
  const first = frets[0] ?? 0
  const last = frets.at(-1) ?? first
  const span = last - first

  if (frets.length === 2) {
    if (span <= 1) return [1, 2]
    if (span === 2) return [1, 3]
    return [1, 4]
  }

  if (frets.length >= 4) {
    if (options.reachProfile === 'stretch' || options.handSize === 'large') {
      return frets.map((_, index) => Math.min(index + 1, 4) as FrettingFinger)
    }
    if (options.reachProfile === 'compact' || options.handSize === 'small') {
      return [1, 1, 2, 4, ...frets.slice(4).map(() => 4 as FrettingFinger)]
    }
    return [1, 2, 4, 4, ...frets.slice(4).map(() => 4 as FrettingFinger)]
  }

  const firstGap = (frets[1] ?? first) - first
  const secondGap = (frets[2] ?? last) - (frets[1] ?? first)
  if (firstGap <= 1 && secondGap >= 2) return [1, 2, 4]
  if (firstGap >= 2 && secondGap <= 1) return [1, 3, 4]
  if (span <= 3) return [1, 2, 4]
  return [1, 2, 4]
}

function addShapeFingerings(
  locations: FretLocation[],
  options: ScaleGenerationOptions,
): FretLocation[] {
  const fingers = new Map<string, FrettingFinger>()
  const stringIndexes = [...new Set(locations.map((location) => location.stringIndex))]
  stringIndexes.forEach((stringIndex) => {
    const onString = locations
      .filter((location) => location.stringIndex === stringIndex)
      .sort((a, b) => a.fret - b.fret)
    const fretted = onString.filter((location) => location.fret > 0)
    const assigned = fingerSequence(fretted.map((location) => location.fret), options)
    fretted.forEach((location, index) => {
      const finger = location.finger ?? assigned[index]
      if (finger) fingers.set(location.id, finger)
    })
  })
  return locations.map((location) => ({ ...location, finger: fingers.get(location.id) }))
}

function transitionCost(previous: FretLocation, current: FretLocation): number {
  const stringMove = current.stringIndex - previous.stringIndex
  const fretMove = Math.abs(current.fret - previous.fret)
  const stringSkip = Math.max(0, stringMove - 1)
  return fretMove * 1.35 + Math.abs(stringMove) * 1.8 + stringSkip * 7
}

function degreeOffsets(notes: ScaleNote[], octaveCount: number): number[] {
  const offsets = Array.from({ length: octaveCount }, (_, octaveIndex) =>
    notes.map((note) => note.interval + octaveIndex * 12),
  ).flat()
  offsets.push(octaveCount * 12)
  return offsets
}

function findRouteFromRoot(
  locations: FretLocation[],
  notes: ScaleNote[],
  octaveCount: number,
  root: FretLocation,
  options: RouteSearchOptions = {},
): FretLocation[] {
  if (notes.length === 0 || root.pitchClass !== notes[0]?.pitchClass) return []
  const targets = degreeOffsets(notes, octaveCount).map((offset) => root.midi + offset)
  const candidatesByStep = targets.map((midi, index) =>
    index === 0
      ? [root]
      : locations.filter((location) => location.midi === midi),
  )
  if (candidatesByStep.some((candidates) => candidates.length === 0)) return []

  let states: RouteState[] = [{
    location: root,
    path: [root],
    minFret: root.fret,
    maxFret: root.fret,
    notesOnString: 1,
    cost: root.fret === 0 ? 2 : 0,
  }]

  for (let step = 1; step < candidatesByStep.length; step += 1) {
    const nextStates: RouteState[] = []
    for (const candidate of candidatesByStep[step] ?? []) {
      for (const state of states) {
        const stringAdvance = candidate.stringIndex - state.location.stringIndex
        if (stringAdvance < 0) continue
        if (options.maxStringAdvance !== undefined && stringAdvance > options.maxStringAdvance) {
          continue
        }
        const notesOnString = stringAdvance === 0 ? state.notesOnString + 1 : 1
        if (
          options.maxNotesPerString !== undefined &&
          notesOnString > options.maxNotesPerString
        ) continue
        const minFret = Math.min(state.minFret, candidate.fret)
        const maxFret = Math.max(state.maxFret, candidate.fret)
        if (
          options.maxFretSpan !== undefined &&
          maxFret - minFret > options.maxFretSpan
        ) continue
        nextStates.push({
          location: candidate,
          path: [...state.path, candidate],
          minFret,
          maxFret,
          notesOnString,
          cost:
            state.cost +
            transitionCost(state.location, candidate) +
            (candidate.fret === 0 ? 0.3 : 0),
        })
      }
    }
    states = nextStates
      .sort((a, b) => {
        if (a.cost !== b.cost) return a.cost - b.cost
        return (a.maxFret - a.minFret) - (b.maxFret - b.minFret)
      })
      .slice(0, 180)
    if (states.length === 0) return []
  }

  return states.sort((a, b) => {
    const aSpan = a.maxFret - a.minFret
    const bSpan = b.maxFret - b.minFret
    if (aSpan !== bSpan) return aSpan - bSpan
    return a.cost - b.cost
  })[0]?.path ?? []
}

export function findTonicPath(
  locations: FretLocation[],
  notes: ScaleNote[],
  octaveCount: number,
  options: RouteSearchOptions = {},
): FretLocation[] {
  const tonic = notes[0]
  if (!tonic) return []
  const roots = options.root
    ? [options.root]
    : locations.filter((location) => location.pitchClass === tonic.pitchClass)
  const candidates = roots.flatMap((root) => {
    const path = findRouteFromRoot(locations, notes, octaveCount, root, options)
    if (path.length !== notes.length * octaveCount + 1) return []
    const frets = path.map((location) => location.fret)
    const stringSpan = (path.at(-1)?.stringIndex ?? 0) - (path[0]?.stringIndex ?? 0)
    return [{
      path,
      score:
        (Math.max(...frets) - Math.min(...frets)) * 20 +
        stringSpan * 2 +
        (root.fret === 0 ? 5 : 0) +
        root.midi * 0.01,
    }]
  })
  return candidates.sort((a, b) => a.score - b.score)[0]?.path ?? []
}

export function findPreferredTonicPath(
  locations: FretLocation[],
  notes: ScaleNote[],
): FretLocation[] {
  const twoOctaves = findTonicPath(locations, notes, 2, { maxNotesPerString: 4 })
  if (twoOctaves.length === notes.length * 2 + 1) return twoOctaves
  return findTonicPath(locations, notes, 1, { maxNotesPerString: 4 })
}

function routeEvents(
  path: FretLocation[],
  options: ScaleGenerationOptions,
): PlayableEvent[] {
  let currentPosition: number | undefined
  const positionReach = options.reachProfile === 'compact' || options.handSize === 'small'
    ? 3
    : options.reachProfile === 'stretch' || options.handSize === 'large' ? 5 : 4
  return path.map((location, index) => {
    const finger = location.fret === 0 ? undefined : location.finger ?? 1
    const previousLocation = path[index - 1]
    const previousFinger = previousLocation?.fret === 0 ? undefined : previousLocation?.finger ?? 1
    const intentionalSlide =
      previousLocation !== undefined &&
      previousLocation.stringIndex === location.stringIndex &&
      previousLocation.fret !== location.fret &&
      previousFinger === finger
    const naturalPosition = location.fret === 0
      ? currentPosition
      : Math.max(1, location.fret - (finger ?? 1) + 1)
    const fitsCurrent =
      !intentionalSlide &&
      currentPosition !== undefined &&
      (location.fret === 0 ||
        (location.fret >= currentPosition && location.fret <= currentPosition + positionReach))
    const nextPosition = fitsCurrent ? currentPosition : naturalPosition
    const shifted =
      currentPosition !== undefined &&
      nextPosition !== undefined &&
      nextPosition !== currentPosition
    const previousPosition = currentPosition
    if (nextPosition !== undefined) currentPosition = nextPosition
    return {
      midi: location.midi,
      startBeat: index * 0.5,
      durationBeats: 0.45,
      locationId: location.id,
      finger,
      handPosition: currentPosition,
      positionShift: shifted,
      shiftBefore: shifted && previousPosition !== undefined && currentPosition !== undefined
        ? {
            from: previousPosition,
            to: currentPosition,
            technique: intentionalSlide ? 'slide' : 'reposition',
          }
        : undefined,
    }
  })
}

function makeRoute(
  id: string,
  name: string,
  kind: PatternRouteKind,
  ascendingPath: FretLocation[],
  options: ScaleGenerationOptions,
): PatternRoute {
  return {
    id,
    name,
    kind,
    ascending: routeEvents(ascendingPath, options),
    descending: routeEvents([...ascendingPath].reverse(), options),
  }
}

function fullShapePath(locations: FretLocation[]): FretLocation[] {
  return [...locations].sort((a, b) => {
    if (a.stringIndex !== b.stringIndex) return a.stringIndex - b.stringIndex
    return a.fret - b.fret
  })
}

function makeRoutes(
  locations: FretLocation[],
  notes: ScaleNote[],
  preferredOctaves: number[],
  includeFullRoute: boolean,
  options: ScaleGenerationOptions,
): { routes: PatternRoute[]; defaultRouteId: string } {
  const routes: PatternRoute[] = []
  if (includeFullRoute) {
    routes.push(makeRoute('full-shape', pick('Вся форма', 'Full shape'), 'full-shape', fullShapePath(locations), options))
  }
  for (const octaves of [1, 2, 3]) {
    if (!preferredOctaves.includes(octaves)) continue
    const path = findTonicPath(locations, notes, octaves, { maxNotesPerString: 4 })
    if (path.length !== notes.length * octaves + 1) continue
    const kind = `tonic-${octaves}oct` as PatternRouteKind
    routes.push(makeRoute(
      kind,
      octaveLabel(octaves),
      kind,
      path,
      options,
    ))
  }
  const preferred = [...preferredOctaves]
    .sort((a, b) => b - a)
    .map((octaves) => `tonic-${octaves}oct`)
    .find((id) => routes.some((route) => route.id === id))
  return { routes, defaultRouteId: preferred ?? routes[0]?.id ?? '' }
}

function calculateErgonomics(
  locations: FretLocation[],
  defaultRoute: PatternRoute | undefined,
  popularity: number,
  family: GuitarScaleFamily,
  options: ScaleGenerationOptions,
): PatternErgonomics {
  const frets = locations.map((location) => location.fret)
  const fretSpan = frets.length > 0 ? Math.max(...frets) - Math.min(...frets) : 0
  const stringIndexes = [...new Set(locations.map((location) => location.stringIndex))]
  const maxStretch = Math.max(0, ...stringIndexes.map((stringIndex) => {
    const onString = locations
      .filter((location) => location.stringIndex === stringIndex && location.fret > 0)
      .sort((a, b) => a.fret - b.fret)
    if (onString.length === 0) return 0
    let segmentStart = onString[0]?.fret ?? 0
    let segmentEnd = segmentStart
    let effectiveStretch = 0
    onString.slice(1).forEach((location, index) => {
      const previous = onString[index]
      if (previous?.finger !== undefined && previous.finger === location.finger) {
        effectiveStretch = Math.max(effectiveStretch, segmentEnd - segmentStart)
        segmentStart = location.fret
      }
      segmentEnd = location.fret
    })
    return Math.max(effectiveStretch, segmentEnd - segmentStart)
  }))
  const shifts = defaultRoute?.ascending.filter((event) => event.positionShift).length ?? 0
  const handAllowance = options.handSize === 'small' ? -1 : options.handSize === 'large' ? 1 : 0
  const reachAllowance = options.reachProfile === 'compact' ? -1 : options.reachProfile === 'stretch' ? 1 : 0
  const comfortableStretch = 4 + handAllowance + reachAllowance
  const stretch = maxStretch <= 3
    ? 'compact'
    : maxStretch <= Math.max(4, comfortableStretch)
      ? 'medium'
      : 'wide'
  const familyDifficulty = family === 'one-octave'
    ? 0
    : family === 'extended'
      ? 2
      : family === '3nps' || family === 'two-octave' ? 1 : 0
  const rawDifficulty =
    1 + familyDifficulty + (maxStretch > comfortableStretch ? 1 : 0) + (shifts >= 2 ? 1 : 0)
  const difficulty = Math.max(1, Math.min(5, rawDifficulty)) as 1 | 2 | 3 | 4 | 5
  const levelPenalty = options.playerLevel === 'beginner'
    ? difficulty * 5
    : options.playerLevel === 'advanced'
      ? difficulty * 1.5
      : difficulty * 3
  const comfort = Math.max(0, Math.min(100,
    Math.round(104 - maxStretch * 5 - shifts * 4 - levelPenalty - Math.max(0, fretSpan - 5) * 1.5),
  ))
  return { fretSpan, shifts, stretch, difficulty, comfort, popularity }
}

function buildPattern({
  id,
  name,
  description,
  family,
  locations,
  notes,
  origin,
  tags,
  popularity,
  generationOptions,
  preferredOctaves = [1, 2],
  includeFullRoute = true,
  sourceId,
  variantGroupId,
  variantId,
}: PatternBuildOptions): PerformancePattern<FretLocation> | null {
  const fingeredLocations = addShapeFingerings(dedupeLocations(locations), generationOptions)
  if (fingeredLocations.length === 0) return null
  const { routes, defaultRouteId } = makeRoutes(
    fingeredLocations,
    notes,
    preferredOctaves,
    includeFullRoute,
    generationOptions,
  )
  const defaultRoute = routes.find((route) => route.id === defaultRouteId) ?? routes[0]
  if (!defaultRoute) return null
  const frets = fingeredLocations.map((location) => location.fret)
  const ergonomics = calculateErgonomics(
    fingeredLocations,
    defaultRoute,
    popularity,
    family,
    generationOptions,
  )
  return {
    id,
    name,
    description,
    system: family,
    locations: fingeredLocations,
    ascending: defaultRoute.ascending,
    descending: defaultRoute.descending,
    startPosition: Math.min(...frets),
    endPosition: Math.max(...frets),
    origin,
    tags,
    routes,
    defaultRouteId: defaultRoute.id,
    ergonomics,
    sourceId,
    variantGroupId,
    variantId,
  }
}

function routeMovementCost(pattern: PerformancePattern<FretLocation>): number {
  const defaultRoute = pattern.routes?.find((route) => route.id === pattern.defaultRouteId)
  const events = defaultRoute?.ascending ?? pattern.ascending
  return events.reduce((cost, event) => {
    const shift = event.shiftBefore
    if (!shift) return cost
    const distance = Math.abs(shift.to - shift.from)
    return cost + (shift.technique === 'slide'
      ? 1.2 + distance * 0.3
      : 3 + distance * 0.6)
  }, 0)
}

function flexibleHybridPlacementPenalty(pattern: PerformancePattern<FretLocation>): number {
  if (pattern.variantGroupId !== FLEXIBLE_TWO_OCTAVE_GROUP) return 0
  const defaultRoute = pattern.routes?.find((route) => route.id === pattern.defaultRouteId)
  const firstEvent = (defaultRoute?.ascending ?? pattern.ascending)[0]
  const rootFret = pattern.locations.find((location) => location.id === firstEvent?.locationId)?.fret
  if (rootFret === undefined) return 0

  // Tonic frets 1–7 keep the movable route in the familiar lower/middle register.
  // The second term avoids pushing the final four-note group beyond the 12th fret
  // when the neighbouring root string offers the same geometry lower on the neck.
  const distanceFromRootBand = rootFret < 1
    ? 1 - rootFret
    : rootFret > 7 ? rootFret - 7 : 0
  const upperRegisterOverflow = Math.max(0, pattern.endPosition - 12)
  return distanceFromRootBand * 8 + upperRegisterOverflow * 6
}

function scorePattern(
  pattern: PerformancePattern<FretLocation>,
  options: ScaleGenerationOptions,
): number {
  const ergonomics = pattern.ergonomics
  if (!ergonomics) return 0
  const familyBonus: Record<string, number> = {
    'one-octave': options.playerLevel === 'beginner' ? 24 : 12,
    caged: 18,
    position: 14,
    '3nps': options.playerLevel === 'advanced' ? 22 : 12,
    'two-octave': options.playerLevel === 'beginner' ? 14 : 22,
    extended: options.playerLevel === 'advanced' ? 18 : 2,
  }
  const movementCost = routeMovementCost(pattern)
  const reachPenalty = options.reachProfile === 'compact'
    ? ergonomics.fretSpan * 2.2 + movementCost
    : options.reachProfile === 'stretch'
      ? movementCost * 0.5
      : ergonomics.fretSpan * 0.8 + movementCost * 0.7
  return ergonomics.popularity + ergonomics.comfort + (familyBonus[pattern.system] ?? 0) -
    reachPenalty - flexibleHybridPlacementPenalty(pattern)
}

export function rankScalePatterns(
  patterns: PerformancePattern<FretLocation>[],
  options: ScaleGenerationOptions = DEFAULT_OPTIONS,
): PerformancePattern<FretLocation>[] {
  return [...patterns].sort((a, b) => scorePattern(b, options) - scorePattern(a, options))
}

function routeExecutionKey(
  pattern: PerformancePattern<FretLocation>,
  route: PatternRoute,
): string {
  const locationsById = new Map(pattern.locations.map((location) => [location.id, location]))
  const events = route.ascending.map((event) => {
    const location = locationsById.get(event.locationId ?? '')
    const coordinate = location
      ? `${location.stringIndex}:${location.fret}:${location.degree}`
      : `midi:${event.midi}`
    const shift = event.shiftBefore
      ? `${event.shiftBefore.technique}:${event.shiftBefore.from}:${event.shiftBefore.to}`
      : '-'
    return `${coordinate}:${event.finger ?? 0}:${event.handPosition ?? 0}:${shift}`
  }).join('>')
  return `${route.kind}[${events}]`
}

/**
 * Exact physical/execution identity for cards shown together in one tab.
 * Display names and source systems are intentionally excluded, while absolute
 * strings/frets, fingers and route mechanics prevent distinct performances
 * or the same relative shape in another register from being collapsed.
 */
export function scalePatternConstructionKey(
  pattern: PerformancePattern<FretLocation>,
): string {
  const locations = [...new Set(pattern.locations.map((location) =>
    `${location.stringIndex}:${location.fret}:${location.degree}:${location.finger ?? 0}`,
  ))].sort().join('|')
  const routes = pattern.routes && pattern.routes.length > 0
    ? pattern.routes
    : [{
        id: 'legacy',
        name: 'legacy',
        kind: 'modal' as const,
        ascending: pattern.ascending,
        descending: pattern.descending,
      }]
  const routeKeys = routes.map((route) => routeExecutionKey(pattern, route)).sort()
  const defaultRoute = routes.find((route) => route.id === pattern.defaultRouteId) ?? routes[0]
  const defaultKey = defaultRoute ? routeExecutionKey(pattern, defaultRoute) : ''
  return `${locations}::${routeKeys.join('|')}::default=${defaultKey}`
}

/** Keeps the highest-ranked member of every exact construction and records its aliases. */
export function groupScalePatternsForDisplay(
  rankedPatterns: PerformancePattern<FretLocation>[],
): ScalePatternDisplayGroup[] {
  const groups: ScalePatternDisplayGroup[] = []
  const groupIndexes = new Map<string, number>()

  rankedPatterns.forEach((pattern) => {
    const signature = scalePatternConstructionKey(pattern)
    const existingIndex = groupIndexes.get(signature)
    if (existingIndex === undefined) {
      groupIndexes.set(signature, groups.length)
      groups.push({
        signature,
        pattern: { ...pattern },
        equivalentIds: [pattern.id],
        aliasNames: [],
      })
      return
    }

    const group = groups[existingIndex]
    if (!group) return
    group.equivalentIds.push(pattern.id)
    if (pattern.name !== group.pattern.name && !group.aliasNames.includes(pattern.name)) {
      group.aliasNames.push(pattern.name)
    }
    group.pattern = {
      ...group.pattern,
      recommended: Boolean(group.pattern.recommended || pattern.recommended),
      preferredVariant: Boolean(group.pattern.preferredVariant || pattern.preferredVariant),
    }
  })

  return groups
}

function markRecommendations(
  patterns: PerformancePattern<FretLocation>[],
  options: ScaleGenerationOptions,
): PerformancePattern<FretLocation>[] {
  const selected = new Set<string>()
  const preferredVariants = new Set<string>()
  const targetPerFamily: GuitarScaleFamily[] = [
    'caged',
    'one-octave',
    'position',
    '3nps',
    'extended',
  ]
  targetPerFamily.forEach((family) => {
    const best = rankScalePatterns(
      patterns.filter((pattern) => pattern.system === family),
      options,
    )[0]
    if (best) selected.add(best.id)
  })
  TWO_OCTAVE_HYBRID_TOPOLOGIES.forEach((topology) => {
    const variantGroupId = `two-octave-${topology.id}`
    const candidates = patterns.filter((pattern) =>
      pattern.system === 'two-octave' && pattern.variantGroupId === variantGroupId,
    )
    const best = rankScalePatterns(
      candidates,
      options,
    )[0]
    if (best) {
      selected.add(best.id)
      if (candidates.length > 1) preferredVariants.add(best.id)
    }
  })
  const recommendationTarget = targetPerFamily.length + TWO_OCTAVE_HYBRID_TOPOLOGIES.length
  if (selected.size < recommendationTarget) {
    const extra = rankScalePatterns(
      patterns.filter((pattern) => !selected.has(pattern.id)),
      options,
    )[0]
    if (extra) selected.add(extra.id)
  }
  return patterns.map((pattern) => ({
    ...pattern,
    recommended: selected.has(pattern.id),
    preferredVariant: preferredVariants.has(pattern.id),
  }))
}

function applyEntryFingering(
  locations: FretLocation[],
  rootString: number,
  entryFingers: readonly FrettingFinger[],
): FretLocation[] {
  const entryLocations = locations
    .filter((location) => location.stringIndex === rootString)
    .sort((a, b) => a.midi - b.midi)
  if (
    entryLocations.length !== entryFingers.length ||
    entryLocations.some((location) => location.fret === 0)
  ) return locations
  const fingersById = new Map(entryLocations.map((location, index) => [
    location.id,
    entryFingers[index],
  ]))
  return locations.map((location) => {
    const finger = fingersById.get(location.id)
    return finger ? { ...location, finger } : location
  })
}

function semitonesForStep(notes: ScaleNote[], step: number): number | null {
  if (notes.length === 0) return null
  const degreeIndex = mod(step, notes.length)
  const note = notes[degreeIndex]
  if (!note) return null
  return note.interval + Math.floor(step / notes.length) * 12
}

function realizeStepGrid(
  config: GuitarConfig,
  notes: ScaleNote[],
  firstString: number,
  steps: ScaleStepGrid,
): FretLocation[] {
  const tonic = notes[0]
  if (!tonic || firstString < 0 || firstString + steps.length > config.strings.length) return []
  const lowestOpen = Math.min(...config.strings)
  const highestMidi = Math.max(...config.strings.map((openMidi) => openMidi + config.frets))
  const firstTonicMidi = lowestOpen + firstFretForPitch(lowestOpen, tonic.pitchClass)
  const rootMidis: number[] = []
  for (let rootMidi = firstTonicMidi - 24; rootMidi <= highestMidi + 24; rootMidi += 12) {
    rootMidis.push(rootMidi)
  }

  const candidates = rootMidis.flatMap((rootMidi) => {
    const locations: FretLocation[] = []
    for (let localString = 0; localString < steps.length; localString += 1) {
      const stringIndex = firstString + localString
      const openMidi = config.strings[stringIndex]
      const stringSteps = steps[localString]
      if (openMidi === undefined || stringSteps === undefined) return []
      for (const step of stringSteps) {
        const offset = semitonesForStep(notes, step)
        if (offset === null) return []
        const midi = rootMidi + offset
        const fret = midi - openMidi
        const note = notes[mod(step, notes.length)]
        if (!note || fret < 0 || fret > config.frets) return []
        locations.push({
          kind: 'fret',
          id: `s${stringIndex}-f${fret}`,
          stringIndex,
          fret,
          midi,
          pitchClass: note.pitchClass,
          degree: note.degree,
          note,
        })
      }
    }
    const frets = locations.map((location) => location.fret)
    const minFret = Math.min(...frets)
    const maxFret = Math.max(...frets)
    return [{
      locations,
      score:
        Math.max(0, minFret - 12) * 8 +
        minFret +
        (maxFret - minFret) * 0.1 +
        (minFret === 0 ? 0.5 : 0),
    }]
  })
  return candidates.sort((a, b) => a.score - b.score)[0]?.locations ?? []
}

export function makeCanonicalCagedPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
  generationOptions: ScaleGenerationOptions = DEFAULT_OPTIONS,
): PerformancePattern<FretLocation>[] {
  const stringOffset = standardSixStringOffset(config)
  if (stringOffset === null || notes.length === 0) return []
  const scaleFamily = detectScaleFamily(notes)
  const isMajor = scaleFamily === 'major'

  return CANONICAL_CAGED_TEMPLATES.flatMap((template, templateIndex) => {
    const locations = realizeStepGrid(config, notes, stringOffset, template.steps)
    const pattern = buildPattern({
      id: `caged-${template.id}-${Math.min(...locations.map((location) => location.fret))}`,
      name: pick(`Форма ${template.name}`, `Shape ${template.name}`),
      description: isMajor
        ? pick(
            `Классическая CAGED-карта, связанная с аккордовой формой ${template.name}`,
            `Classic CAGED map tied to the ${template.name} chord shape`,
          )
        : pick(
            `Минорная карта по контуру CAGED ${template.name}; ступени пересчитаны для выбранного вида минора`,
            `Minor map along the CAGED ${template.name} contour; degrees recomputed for the selected minor type`,
          ),
      family: 'caged',
      locations,
      notes,
      origin: 'canonical',
      tags: [
        'CAGED',
        isMajor ? pick('Аккордовая опора', 'Chord anchor') : pick('Минорная геометрия', 'Minor geometry'),
        templateIndex === 3 ? pick('Тоника на 6-й струне', 'Root on 6th string') : pick('Переносимая', 'Movable'),
        ...(['harmonic-minor', 'melodic-minor'].includes(scaleFamily) ? [pick('Контроль растяжки', 'Stretch control')] : []),
      ],
      popularity: isMajor ? template.popularity : template.id === 'e' ? 89 : template.popularity - 8,
      generationOptions,
      sourceId: `caged-${template.id}`,
    })
    return pattern ? [pattern] : []
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

function sequentialThreeNpsLocations(
  config: GuitarConfig,
  notes: ScaleNote[],
  stringIndexes: number[],
  startDegree: number,
): FretLocation[] {
  const allLocations = locateScale(config, notes)
  const byPosition = new Map(
    allLocations.map((location) => [`${location.stringIndex}:${location.fret}`, location]),
  )
  const lowStringIndex = stringIndexes[0]
  const lowOpen = lowStringIndex === undefined ? undefined : config.strings[lowStringIndex]
  const degreeNote = notes[startDegree]
  if (lowStringIndex === undefined || lowOpen === undefined || !degreeNote) return []
  const firstAnchor = firstFretForPitch(lowOpen, degreeNote.pitchClass)
  const anchorCandidates = [firstAnchor, firstAnchor + 12]

  const candidates = anchorCandidates.flatMap((anchorFret) => {
    if (anchorFret > config.frets) return []
    const startMidi = lowOpen + anchorFret
    const locations: FretLocation[] = []
    for (let localString = 0; localString < stringIndexes.length; localString += 1) {
      const stringIndex = stringIndexes[localString]
      const openMidi = stringIndex === undefined ? undefined : config.strings[stringIndex]
      if (stringIndex === undefined || openMidi === undefined) return []
      for (let noteOnString = 0; noteOnString < 3; noteOnString += 1) {
        const step = localString * 3 + noteOnString
        const offset = scaleOffsetFromDegree(notes, startDegree, step)
        if (offset === null) return []
        const fret = startMidi + offset - openMidi
        const location = byPosition.get(`${stringIndex}:${fret}`)
        if (!location || fret < 0 || fret > config.frets) return []
        locations.push(location)
      }
    }
    const frets = locations.map((location) => location.fret)
    const span = Math.max(...frets) - Math.min(...frets)
    return [{
      locations,
      score: span * 30 + Math.max(0, Math.min(...frets) - 12) * 4 + Math.min(...frets),
    }]
  })
  return candidates.sort((a, b) => a.score - b.score)[0]?.locations ?? []
}

export function makeThreeNpsPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
  generationOptions: ScaleGenerationOptions = DEFAULT_OPTIONS,
): PerformancePattern<FretLocation>[] {
  if (notes.length !== 7) return []
  const scaleFamily = detectScaleFamily(notes)
  const standardOffset = standardSixStringOffset(config)
  const stringIndexes = standardOffset === null
    ? config.strings.map((_, index) => index)
    : Array.from({ length: 6 }, (_, index) => standardOffset + index)
  const origin = standardOffset === null ? 'generated' as const : 'canonical' as const

  return CANONICAL_THREE_NPS_TEMPLATES.flatMap((template) => {
    const degreeNote = notes[template.startDegree]
    if (!degreeNote) return []
    const locations = sequentialThreeNpsLocations(
      config,
      notes,
      stringIndexes,
      template.startDegree,
    )
    const pattern = buildPattern({
      id: `${origin}-3nps-${template.position}-${locations[0]?.fret ?? 0}`,
      name: `3NPS ${template.position} · ${degreeNote.symbol}`,
      description: origin === 'canonical'
        ? pick('Стандартная последовательная форма: три ноты на каждой струне', 'Standard sequential shape: three notes on every string')
        : pick('Три ноты на струне, рассчитанные для выбранного строя', 'Three notes per string, computed for the current tuning'),
      family: '3nps',
      locations,
      notes,
      origin,
      tags: [
        pick('3 ноты/струна', '3 notes/string'),
        'Alternate picking',
        origin === 'canonical' ? pick('Классическая', 'Classic') : pick('Под текущий строй', 'For current tuning'),
        ...(['harmonic-minor', 'melodic-minor'].includes(scaleFamily) ? [pick('Широкий интервал', 'Wide interval')] : []),
      ],
      popularity: template.startDegree === 0 ? 96 : 84 - template.startDegree,
      generationOptions,
      preferredOctaves: [1, 2, 3],
      sourceId: `3nps-degree-${template.startDegree + 1}`,
    })
    return pattern ? [pattern] : []
  })
}

export function makePositionalPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
  generationOptions: ScaleGenerationOptions = DEFAULT_OPTIONS,
): PerformancePattern<FretLocation>[] {
  if (notes.length !== 7) return []
  const standardOffset = standardSixStringOffset(config)
  const firstString = standardOffset ?? 0
  if (standardOffset === null && config.strings.length !== 6) return []
  const origin = standardOffset === null ? 'generated' as const : 'canonical' as const
  const scaleFamily = detectScaleFamily(notes)

  return POSITIONAL_SCALE_TEMPLATES.flatMap((template) => {
    const locations = realizeStepGrid(config, notes, firstString, template.steps)
    const pattern = buildPattern({
      id: `position-${template.position}-${Math.min(...locations.map((location) => location.fret))}`,
      name: pick(`Позиционная ${template.position}`, `Positional ${template.position}`),
      description: pick(
        'Семь позиционных форм в стиле Berklee: кисть остаётся в пределах одной позиции',
        'Seven Berklee-style positional shapes: the hand stays within one position',
      ),
      family: 'position',
      locations,
      notes,
      origin,
      tags: [pick('Позиционная', 'Positional'), pick('Чтение с листа', 'Sight-reading'), origin === 'canonical' ? pick('Проверенная карта', 'Proven map') : pick('Под текущий строй', 'For current tuning')],
      popularity: scaleFamily === 'natural-minor' && template.position === 5
        ? 100
        : template.position === 4 ? 93 : 88 - template.position,
      generationOptions,
      sourceId: `position-${template.id}`,
    })
    return pattern ? [pattern] : []
  })
}

export function makeOneOctavePatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
  generationOptions: ScaleGenerationOptions = DEFAULT_OPTIONS,
): PerformancePattern<FretLocation>[] {
  const tonic = notes[0]
  if (!tonic || notes.length === 0) return []
  const standardOffset = standardSixStringOffset(config)
  const scaleFamily = detectScaleFamily(notes)
  const firstString = standardOffset ?? 0
  const rootStrings = Array.from(
    { length: Math.min(4, config.strings.length - firstString - 1) },
    (_, index) => firstString + index,
  )

  return rootStrings.flatMap((rootString, rootIndex) =>
    ONE_OCTAVE_TOPOLOGIES.flatMap((topology) => {
      const locations = realizeStepGrid(config, notes, rootString, topology.steps)
      const visibleStringNumber = config.strings.length - rootString
      const pattern = buildPattern({
        id: `one-octave-${topology.id}-string-${rootString}-${locations[0]?.fret ?? 0}`,
        name: pick(`${topology.name} · с ${visibleStringNumber}-й струны`, `${topology.name} · from ${stringOrdinal(visibleStringNumber)}`),
        description: pick(
          'Проверенная однооктавная геометрия тоника → тоника для разучивания и фразировки',
          'Proven one-octave tonic → tonic geometry for learning and phrasing',
        ),
        family: 'one-octave',
        locations,
        notes,
        origin: standardOffset === null ? 'generated' : 'canonical',
        tags: [pick('Тоника → тоника', 'Tonic → tonic'), topology.name, stringOrdinal(visibleStringNumber)],
        popularity:
          topology.popularity -
          rootIndex * 3 +
          (scaleFamily === 'natural-minor' && topology.id === 'forward' ? 7 : 0),
        generationOptions,
        preferredOctaves: [1],
        includeFullRoute: false,
        sourceId: `one-octave-${topology.id}-root-string-${rootIndex + 1}`,
      })
      return pattern ? [pattern] : []
    }),
  )
}

export function makeTwoOctaveHybridPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
  generationOptions: ScaleGenerationOptions = DEFAULT_OPTIONS,
): PerformancePattern<FretLocation>[] {
  if (notes.length !== 7 || config.strings.length < 6) return []
  const standardOffset = standardSixStringOffset(config)
  const firstRootString = standardOffset ?? Math.max(0, config.strings.length - 6)
  const origin = standardOffset === null ? 'generated' as const : 'curated' as const

  return TWO_OCTAVE_HYBRID_TOPOLOGIES.flatMap((topology) => {
    const rootStrings = topology.steps.length === 5
      ? [firstRootString, firstRootString + 1]
      : [firstRootString]
    return rootStrings.flatMap((rootString) => {
      const locations = applyEntryFingering(
        realizeStepGrid(config, notes, rootString, topology.steps),
        rootString,
        topology.entryFingers,
      )
      const visibleStringNumber = config.strings.length - rootString
      const pattern = buildPattern({
        id: `two-octave-${topology.id}-string-${rootString}-${locations[0]?.fret ?? 0}`,
        name: pick(`${topology.shortName} · ${visibleStringNumber}-я стр.`, `${topology.shortName} · str. ${visibleStringNumber}`),
        description: pick(
          `Двухоктавный гибрид с точным распределением ${topology.name} нот по последовательным струнам`,
          `Two-octave hybrid with the exact ${topology.name} note distribution across consecutive strings`,
        ),
        family: 'two-octave',
        locations,
        notes,
        origin,
        tags: [
          pick('Тоника → тоника → тоника', 'Tonic → tonic → tonic'),
          pick(`${topology.name} по струнам`, `${topology.name} across strings`),
          topology.steps.length === 5 ? pick('5 струн', '5 strings') : pick('6 струн', '6 strings'),
          origin === 'curated' ? pick('Гибридный маршрут', 'Hybrid route') : pick('Под текущий строй', 'For current tuning'),
        ],
        popularity: topology.popularity,
        generationOptions,
        preferredOctaves: [1, 2],
        includeFullRoute: false,
        sourceId: `two-octave-${topology.id}-root-${visibleStringNumber}`,
        variantGroupId: `two-octave-${topology.id}`,
        variantId: `root-${visibleStringNumber}`,
      })
      return pattern ? [pattern] : []
    })
  })
}

export function makeExtendedPatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
  generationOptions: ScaleGenerationOptions = DEFAULT_OPTIONS,
): PerformancePattern<FretLocation>[] {
  const tonic = notes[0]
  if (!tonic || notes.length === 0) return []
  const allLocations = locateScale(config, notes)
  const rootCandidates = allLocations
    .filter((location) =>
      location.pitchClass === tonic.pitchClass &&
      location.stringIndex <= Math.min(2, config.strings.length - 2) &&
      location.fret <= 12,
    )
  const candidates = rootCandidates.flatMap((root) => {
    const threeOctaves = findRouteFromRoot(allLocations, notes, 3, root, {
      maxNotesPerString: 4,
      maxFretSpan: generationOptions.reachProfile === 'compact' ? 13 : 16,
      maxStringAdvance: 1,
    })
    const octaveCount = threeOctaves.length === notes.length * 3 + 1 ? 3 : 2
    const path = octaveCount === 3
      ? threeOctaves
      : findRouteFromRoot(allLocations, notes, 2, root, {
          maxNotesPerString: 4,
          maxFretSpan: 14,
          maxStringAdvance: 1,
        })
    if (path.length !== notes.length * octaveCount + 1) return []
    const frets = path.map((location) => location.fret)
    const shifts = path.slice(1).filter((location, index) =>
      Math.abs(location.fret - (path[index]?.fret ?? location.fret)) > 4,
    ).length
    return [{
      root,
      path,
      octaveCount,
      score: (Math.max(...frets) - Math.min(...frets)) * 10 + shifts * 5 + root.midi * 0.01,
    }]
  })
  const unique = new Map<string, (typeof candidates)[number]>()
  candidates.sort((a, b) => a.score - b.score).forEach((candidate) => {
    const signature = candidate.path.map((location) => location.id).join('|')
    if (!unique.has(signature) && unique.size < 3) unique.set(signature, candidate)
  })

  return [...unique.values()].flatMap((candidate, index) => {
    const pattern = buildPattern({
      id: `extended-${candidate.root.stringIndex}-${candidate.root.fret}-${candidate.octaveCount}`,
      name: pick(`Диагональ ${index + 1} · ${candidate.octaveCount} октавы`, `Diagonal ${index + 1} · ${octaveLabel(candidate.octaveCount)}`),
      description: pick(
        'Расширенный маршрут соединяет соседние позиции вдоль грифа',
        'Extended route linking adjacent positions along the neck',
      ),
      family: 'extended',
      locations: candidate.path,
      notes,
      origin: 'generated',
      tags: [pick('Диагональная', 'Diagonal'), pick('Смены позиции', 'Position shifts'), octaveLabel(candidate.octaveCount)],
      popularity: 78 - index * 3,
      generationOptions,
      preferredOctaves: candidate.octaveCount === 3 ? [1, 2, 3] : [1, 2],
      includeFullRoute: false,
      sourceId: `extended-diagonal-${index + 1}`,
    })
    return pattern ? [pattern] : []
  })
}

export function makeAllScalePatterns(
  config: GuitarConfig,
  notes: ScaleNote[],
  generationOptions: ScaleGenerationOptions = DEFAULT_OPTIONS,
): PerformancePattern<FretLocation>[] {
  const patterns = [
    ...makeCanonicalCagedPatterns(config, notes, generationOptions),
    ...makePositionalPatterns(config, notes, generationOptions),
    ...makeThreeNpsPatterns(config, notes, generationOptions),
    ...makeOneOctavePatterns(config, notes, generationOptions),
    ...makeTwoOctaveHybridPatterns(config, notes, generationOptions),
    ...makeExtendedPatterns(config, notes, generationOptions),
  ]
  return markRecommendations(patterns, generationOptions)
}
