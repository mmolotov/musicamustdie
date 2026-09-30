import type { Dispatch, SetStateAction } from 'react'
import { getFrettedSpec, type FrettedInstrumentSpec } from '../instruments/fretted'
import { guitarSpec, type GuitarPreferences } from '../instruments/guitar'
import { usePersistentState } from './usePersistentState'

interface FrettedPreferences {
  spec: FrettedInstrumentSpec
  preferences: GuitarPreferences
  setPreferences: Dispatch<SetStateAction<GuitarPreferences>>
}

/**
 * Per-instrument tuning presets, string counts, storage key and defaults, with
 * the player's saved preferences on top. Whatever renders an instrument is
 * remounted when the instrument changes, so reading the spec once is enough.
 */
export function useFrettedPreferences(instrumentId: string): FrettedPreferences {
  const spec = getFrettedSpec(instrumentId) ?? guitarSpec
  const [preferences, setPreferences] = usePersistentState<GuitarPreferences>(
    spec.storageKey,
    structuredClone(spec.defaultPreferences),
    spec.validatePreferences,
  )
  return { spec, preferences, setPreferences }
}
