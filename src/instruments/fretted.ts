import type { GuitarPreferences, GuitarPreset } from './guitar'

/**
 * Per-instrument specifics for a fretted instrument (guitar, bass, …) that the
 * shared workspace/settings UI need. The music engine itself
 * (locateScaleOnFretboard / generateGuitarPatterns / voicings) is
 * string-count-agnostic and shared across all fretted instruments.
 */
export interface FrettedInstrumentSpec {
  id: string
  /** Tuning presets offered for this instrument. */
  presets: GuitarPreset[]
  /** Selectable string counts, e.g. [6, 7, 8] guitar, [4, 5, 6] bass. */
  stringCounts: number[]
  /** localStorage key for this instrument's persisted preferences. */
  storageKey: string
  defaultPreferences: GuitarPreferences
  validatePreferences: (value: unknown) => value is GuitarPreferences
}

const specs = new Map<string, FrettedInstrumentSpec>()

export function registerFrettedSpec(spec: FrettedInstrumentSpec): void {
  specs.set(spec.id, spec)
}

export function getFrettedSpec(id: string): FrettedInstrumentSpec | undefined {
  return specs.get(id)
}
