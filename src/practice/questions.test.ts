import { describe, expect, it } from 'vitest'
import {
  checkChord,
  checkNoteSlots,
  emptyNoteSlots,
  expectedPitchClasses,
  noteSlotsFilled,
} from './questions'
import { buildScale, harmonizeScale } from '../music/theory'

describe('вопрос о составе нот', () => {
  const scale = buildScale({ tonic: 3, mode: 'major', spelling: 'flat' })
  const expected = expectedPitchClasses(scale.ascending)

  it('сверяет ступени по звуковысотности, а не по написанию', () => {
    // D♯ вместо E♭ — то же звучание, тот же зачёт.
    expect(checkNoteSlots(expected, expected).every(Boolean)).toBe(true)
    expect(expected[0]).toBe(3)
  })

  it('показывает, какая именно ступень не сошлась', () => {
    const entered = [...expected]
    entered[4] = (expected[4] ?? 0) + 1
    expect(checkNoteSlots(entered, expected)).toEqual([true, true, true, true, false, true, true])
  })

  it('пустые слоты не считаются заполненными', () => {
    expect(noteSlotsFilled(emptyNoteSlots())).toBe(false)
    expect(noteSlotsFilled(expected)).toBe(true)
    expect(checkNoteSlots(emptyNoteSlots(), expected).some(Boolean)).toBe(false)
  })
})

describe('вопрос об аккорде ступени', () => {
  const harmony = harmonizeScale(buildScale({ tonic: 0, mode: 'major', spelling: 'sharp' }).ascending)

  it('сверяет основной тон и качество', () => {
    const sixth = harmony[5]!.triad
    expect(sixth.symbol).toBe('Am')
    expect(checkChord(sixth, { root: 9, quality: 'minor' })).toBe(true)
    expect(checkChord(sixth, { root: 9, quality: 'major' })).toBe(false)
    expect(checkChord(sixth, { root: 7, quality: 'minor' })).toBe(false)
  })

  it('знает про уменьшённое трезвучие на VII ступени', () => {
    expect(checkChord(harmony[6]!.triad, { root: 11, quality: 'diminished' })).toBe(true)
  })

  it('ловит увеличенное трезвучие гармонического минора', () => {
    const harmonicMinor = harmonizeScale(
      buildScale({ tonic: 9, mode: 'minor', spelling: 'sharp' }, 'harmonic').ascending,
    )
    expect(harmonicMinor[2]!.triad.quality).toBe('augmented')
    expect(checkChord(harmonicMinor[2]!.triad, { root: 0, quality: 'augmented' })).toBe(true)
    expect(checkChord(harmonicMinor[2]!.triad, { root: 0, quality: 'major' })).toBe(false)
  })
})
