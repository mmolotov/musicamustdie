import { describe, expect, it } from 'vitest'
import { buildScale, defaultSpellingForMajorPitch } from './theory'
import { ascendingScaleMidis } from './playback'

describe('MIDI-высоты ступеней', () => {
  it('не опускает C на октаву при ручном проигрывании G major', () => {
    const scale = buildScale({ tonic: 7, mode: 'major', spelling: 'sharp' })

    expect(ascendingScaleMidis(scale.ascending)).toEqual([67, 69, 71, 72, 74, 76, 78])
  })

  it('сохраняет восходящее движение во всех мажорных тональностях', () => {
    for (let tonic = 0; tonic < 12; tonic += 1) {
      const scale = buildScale({
        tonic,
        mode: 'major',
        spelling: defaultSpellingForMajorPitch(tonic),
      })
      const midis = ascendingScaleMidis(scale.ascending)

      expect(midis.every((midi, index) => index === 0 || midi > (midis[index - 1] ?? midi))).toBe(true)
    }
  })
})
