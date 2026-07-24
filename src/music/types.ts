export type Mode = 'major' | 'minor'

export type AccidentalPreference = 'sharp' | 'flat'

export type MinorVariant =
  | 'natural'
  | 'harmonic'
  | 'melodic-classical'
  | 'melodic-jazz'

export type ScaleDirection = 'ascending' | 'descending'

export type LetterName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'

export interface KeySelection {
  tonic: number
  mode: Mode
  spelling: AccidentalPreference
}

export interface SpelledNote {
  letter: LetterName
  accidental: number
  pitchClass: number
  symbol: string
  solfege: string
  accessibleName: string
}

export interface ScaleNote extends SpelledNote {
  degree: number
  interval: number
  degreeLabel: string
}

export interface BuiltScale {
  id: 'major' | MinorVariant
  label: string
  shortLabel: string
  selection: KeySelection
  tonic: SpelledNote
  ascending: ScaleNote[]
  descending: ScaleNote[]
  formula: string
}

export type ChordSize = 'triad' | 'seventh'

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'major-seventh'
  | 'dominant-seventh'
  | 'minor-seventh'
  | 'half-diminished-seventh'
  | 'diminished-seventh'
  | 'minor-major-seventh'
  | 'augmented-major-seventh'
  | 'other'

export interface ChordDefinition {
  degree: number
  size: ChordSize
  root: ScaleNote
  notes: ScaleNote[]
  pitchClasses: number[]
  requiredPitchClasses: number[]
  quality: ChordQuality
  qualityLabel: string
  symbol: string
  roman: string
}

export interface HarmonizedDegree {
  degree: number
  triad: ChordDefinition
  seventh: ChordDefinition
}

export interface KeySignature {
  count: number
  accidental: 'sharp' | 'flat' | 'natural'
  label: string
}
