import { describe, expect, it } from 'vitest'
import { buildScale } from '../music/theory'
import {
  BASS_PRESETS,
  DEFAULT_BASS_CONFIG,
  DEFAULT_BASS_PREFERENCES,
  bassModule,
  bassSpec,
} from './bass'
import { isGuitarConfig } from './guitar'

const cMajor = buildScale({ tonic: 0, mode: 'major', spelling: 'sharp' })

describe('bass guitar module', () => {
  it('registers as a fretted instrument distinct from the guitar', () => {
    expect(bassModule.id).toBe('bass-guitar')
    expect(bassModule.family).toBe('fretted-strings')
    expect(bassModule.capabilities.fretboard).toBe(true)
    expect(bassModule.capabilities.keyboard).toBe(false)
  })

  it('defaults to a 4-string E-standard tuning (E1 A1 D2 G2)', () => {
    expect(DEFAULT_BASS_CONFIG.strings).toEqual([28, 33, 38, 43])
    expect(BASS_PRESETS.map((preset) => preset.strings.length).sort()).toEqual([4, 4, 5, 5, 6])
  })

  it('validates 4–6 strings and rejects a 3-string config', () => {
    expect(bassModule.validateConfig(DEFAULT_BASS_CONFIG)).toBe(true)
    // A 6-string guitar config is too many strings for the bass validator.
    expect(bassModule.validateConfig({ strings: [40, 45, 50, 55, 59, 64, 68], frets: 24, handedness: 'right', presetId: 'x' })).toBe(false)
    expect(bassModule.validateConfig({ strings: [28, 33, 38], frets: 24, handedness: 'right', presetId: 'x' })).toBe(false)
    // The shared guitar validator, with bass bounds, agrees.
    expect(isGuitarConfig(DEFAULT_BASS_CONFIG, 4, 6)).toBe(true)
    expect(isGuitarConfig(DEFAULT_BASS_CONFIG)).toBe(false) // default 6–8 bounds reject it
  })

  it('reuses the fretted engine to locate notes and generate patterns', () => {
    const locations = bassModule.locateScale(DEFAULT_BASS_CONFIG, cMajor.ascending)
    expect(locations.length).toBeGreaterThan(0)
    expect(locations.every((location) => location.kind === 'fret')).toBe(true)

    const patterns = bassModule.generatePatterns(DEFAULT_BASS_CONFIG, cMajor.ascending, 'ascending')
    expect(patterns.length).toBeGreaterThan(0)
  })

  it('exposes a spec with its own storage key and validator', () => {
    expect(bassSpec.storageKey).toBe('qfc.instrument.bass-guitar.v1')
    expect(bassSpec.stringCounts).toEqual([4, 5, 6])
    expect(bassSpec.validatePreferences(DEFAULT_BASS_PREFERENCES)).toBe(true)
  })
})
