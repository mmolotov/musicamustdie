import type { ChordDefinition, ScaleDirection, ScaleNote } from '../music/types'

export interface InstrumentCapabilities {
  fretboard: boolean
  tablature: boolean
  chordDiagrams: boolean
  keyboard: boolean
  fingerings: boolean
}

export interface PlayableEvent {
  midi: number
  startBeat: number
  durationBeats: number
  locationId?: string
  finger?: FrettingFinger
  handPosition?: number
  positionShift?: boolean
  shiftBefore?: PositionShift
}

export type FrettingFinger = 1 | 2 | 3 | 4

export interface PositionShift {
  from: number
  to: number
  technique: 'reposition' | 'slide'
}

export interface FretLocation {
  kind: 'fret'
  id: string
  stringIndex: number
  fret: number
  midi: number
  pitchClass: number
  degree: number
  note: ScaleNote
  finger?: FrettingFinger
  positionShift?: boolean
}

export interface KeyboardLocation {
  kind: 'key'
  id: string
  keyIndex: number
  midi: number
  pitchClass: number
  degree: number
  note: ScaleNote
}

export type InstrumentLocation = FretLocation | KeyboardLocation

export type GuitarScaleFamily =
  | 'caged'
  | 'position'
  | '3nps'
  | 'one-octave'
  | 'two-octave'
  | 'extended'
  | 'pentatonic'
export type PatternSystem = GuitarScaleFamily | 'full-range' | string
export type PatternOrigin = 'canonical' | 'curated' | 'generated'

export type PatternRouteKind =
  | 'full-shape'
  | 'tonic-1oct'
  | 'tonic-2oct'
  | 'tonic-3oct'
  | 'modal'

export interface PatternRoute {
  id: string
  name: string
  kind: PatternRouteKind
  ascending: PlayableEvent[]
  descending: PlayableEvent[]
}

export interface PatternErgonomics {
  fretSpan: number
  shifts: number
  stretch: 'compact' | 'medium' | 'wide'
  difficulty: 1 | 2 | 3 | 4 | 5
  comfort: number
  popularity: number
}

export interface PerformancePattern<Location extends InstrumentLocation = InstrumentLocation> {
  id: string
  name: string
  description: string
  system: PatternSystem
  locations: Location[]
  ascending: PlayableEvent[]
  descending: PlayableEvent[]
  startPosition: number
  endPosition: number
  origin?: PatternOrigin
  tags?: string[]
  routes?: PatternRoute[]
  defaultRouteId?: string
  ergonomics?: PatternErgonomics
  recommended?: boolean
  sourceId?: string
  variantGroupId?: string
  variantId?: string
  preferredVariant?: boolean
}

export interface InstrumentModule<Config> {
  id: string
  label: string
  family: string
  capabilities: InstrumentCapabilities
  defaultConfig: Config
  validateConfig: (value: unknown) => value is Config
  locateScale: (config: Config, notes: ScaleNote[]) => InstrumentLocation[]
  generatePatterns: (
    config: Config,
    notes: ScaleNote[],
    direction: ScaleDirection,
  ) => PerformancePattern[]
  getChordEvents: (config: Config, chord: ChordDefinition) => PlayableEvent[]
}
