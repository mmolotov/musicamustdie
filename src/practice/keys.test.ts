import { describe, expect, it } from 'vitest'
import { CIRCLE_KEYS, drawKey } from './keys'
import {
  CIRCLE_MAJOR_PITCHES,
  defaultSpellingForMajorPitch,
  getRelativeMinorPitch,
} from '../music/theory'

describe('выбор тональности барабаном', () => {
  it('покрывает все 24 тональности круга в том же написании', () => {
    expect(CIRCLE_KEYS).toHaveLength(24)

    CIRCLE_MAJOR_PITCHES.forEach((majorPitch, sectorIndex) => {
      const spelling = defaultSpellingForMajorPitch(majorPitch)
      expect(CIRCLE_KEYS).toContainEqual({
        selection: { tonic: majorPitch, mode: 'major', spelling },
        sectorIndex,
      })
      expect(CIRCLE_KEYS).toContainEqual({
        selection: { tonic: getRelativeMinorPitch(majorPitch), mode: 'minor', spelling },
        sectorIndex,
      })
    })
  })

  it('никогда не выдаёт ту же тональность, что и в прошлом раунде', () => {
    let seed = 2024
    let previous = CIRCLE_KEYS[0]?.selection ?? null

    for (let round = 0; round < 300; round += 1) {
      const draw = drawKey(seed, previous)
      expect(previous && draw.key.selection.tonic === previous.tonic
        && draw.key.selection.mode === previous.mode).toBe(false)
      seed = draw.seed
      previous = draw.key.selection
    }
  })

  it('с одним зерном разыгрывает один и тот же раунд', () => {
    expect(drawKey(99, null).key).toEqual(drawKey(99, null).key)
  })
})
