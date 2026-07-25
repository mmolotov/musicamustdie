import type { ChordDefinition } from '../music/types'
import { pick } from '../i18n'
import type { InstrumentModule, PlayableEvent } from './types'
import type { FrettedInstrumentSpec } from './fretted'
import {
  DEFAULT_VOICING_CONSTRAINTS,
  frettedChordEvents,
  generateGuitarPatterns,
  isGuitarConfig,
  isGuitarPreferences,
  locateScaleOnFretboard,
  type GuitarConfig,
  type GuitarPreferences,
  type GuitarPreset,
} from './guitar'

// Bass tunings (MIDI). String 1 (index 0) is the lowest, matching GuitarConfig.
export const BASS_PRESETS: GuitarPreset[] = [
  { id: '4-standard-e', name: 'E Standard', strings: [28, 33, 38, 43] }, // E1 A1 D2 G2
  { id: '4-drop-d', name: 'Drop D', strings: [26, 33, 38, 43] }, //        D1 A1 D2 G2
  { id: '5-standard-b', name: 'B Standard', strings: [23, 28, 33, 38, 43] }, // B0 E1 A1 D2 G2
  { id: '5-high-c', name: 'High C', strings: [28, 33, 38, 43, 48] }, //     E1 A1 D2 G2 C3
  { id: '6-standard', name: 'B–C', strings: [23, 28, 33, 38, 43, 48] }, //  B0 E1 A1 D2 G2 C3
]

const BASS_MIN_STRINGS = 4
const BASS_MAX_STRINGS = 6

export const DEFAULT_BASS_CONFIG: GuitarConfig = {
  strings: [...(BASS_PRESETS[0]?.strings ?? [28, 33, 38, 43])],
  frets: 24,
  handedness: 'right',
  presetId: '4-standard-e',
}

export const DEFAULT_BASS_PREFERENCES: GuitarPreferences = {
  version: 1,
  config: DEFAULT_BASS_CONFIG,
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

function isBassConfig(value: unknown): value is GuitarConfig {
  return isGuitarConfig(value, BASS_MIN_STRINGS, BASS_MAX_STRINGS)
}

export const bassModule: InstrumentModule<GuitarConfig> = {
  id: 'bass-guitar',
  get label() {
    return pick('Бас-гитара', 'Bass guitar')
  },
  family: 'fretted-strings',
  capabilities: {
    fretboard: true,
    tablature: true,
    chordDiagrams: true,
    keyboard: false,
    fingerings: true,
  },
  defaultConfig: DEFAULT_BASS_CONFIG,
  validateConfig: isBassConfig,
  locateScale: locateScaleOnFretboard,
  generatePatterns: generateGuitarPatterns,
  getChordEvents: (config, chord: ChordDefinition): PlayableEvent[] =>
    frettedChordEvents(config, chord),
}

export const bassSpec: FrettedInstrumentSpec = {
  id: 'bass-guitar',
  presets: BASS_PRESETS,
  stringCounts: [BASS_MIN_STRINGS, 5, BASS_MAX_STRINGS],
  storageKey: 'qfc.instrument.bass-guitar.v1',
  defaultPreferences: DEFAULT_BASS_PREFERENCES,
  validatePreferences: (value): value is GuitarPreferences =>
    isGuitarPreferences(value, BASS_MIN_STRINGS, BASS_MAX_STRINGS),
}
