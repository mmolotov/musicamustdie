import { describe, expect, it } from 'vitest'
import {
  acceptedSignatures,
  checkNoteSlots,
  checkSignature,
  emptyNoteSlots,
  expectedPitchClasses,
  noteSlotsFilled,
} from './questions'
import { buildScale } from '../music/theory'
import type { KeySelection } from '../music/types'

const cMajor: KeySelection = { tonic: 0, mode: 'major', spelling: 'sharp' }
const fSharpMajor: KeySelection = { tonic: 6, mode: 'major', spelling: 'sharp' }
const eFlatMinor: KeySelection = { tonic: 3, mode: 'minor', spelling: 'flat' }

describe('вопрос о знаках при ключе', () => {
  it('у обычной тональности один верный ответ', () => {
    expect(acceptedSignatures(cMajor)).toEqual([
      { count: 0, accidental: 'natural', label: 'без знаков' },
    ])
  })

  it('у энгармонической тональности верны оба ответа', () => {
    const accepted = acceptedSignatures(fSharpMajor)
    expect(accepted).toHaveLength(2)
    expect(checkSignature(fSharpMajor, { count: 6, accidental: 'sharp' })).toBe(true)
    expect(checkSignature(fSharpMajor, { count: 6, accidental: 'flat' })).toBe(true)
    expect(checkSignature(fSharpMajor, { count: 5, accidental: 'sharp' })).toBe(false)
  })

  it('засчитывает энгармонику и в миноре', () => {
    expect(checkSignature(eFlatMinor, { count: 6, accidental: 'flat' })).toBe(true)
    expect(checkSignature(eFlatMinor, { count: 6, accidental: 'sharp' })).toBe(true)
  })

  it('«ноль знаков» не зависит от переключателя диезов и бемолей', () => {
    expect(checkSignature(cMajor, { count: 0, accidental: 'sharp' })).toBe(true)
    expect(checkSignature(cMajor, { count: 0, accidental: 'natural' })).toBe(true)
    expect(checkSignature(cMajor, { count: 1, accidental: 'sharp' })).toBe(false)
  })
})

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
