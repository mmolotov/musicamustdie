import { describe, expect, it } from 'vitest'
import { judgeNote } from './judge'
import { zoneCards } from './zone'
import type { NeckCard } from './types'

const GUITAR = [40, 45, 50, 55, 59, 64]

function card(stringIndex: number, pitchClass: number): NeckCard {
  const found = zoneCards(GUITAR, 24, { strings: [stringIndex], span: 'low', pool: 'all' }).find(
    (candidate) => candidate.pitchClass === pitchClass,
  )
  if (!found) throw new Error('No such card in the zone')
  return found
}

const F_ON_SIXTH = card(0, 5)
const E_ON_SIXTH = card(0, 4)

describe('оценка сыгранной ноты', () => {
  it('верная высота — верный ответ', () => {
    expect(judgeNote(F_ON_SIXTH, GUITAR, 24, 41)).toEqual({
      kind: 'correct',
      cell: { stringIndex: 0, fret: 1, midi: 41 },
    })
  })

  it('засчитывает любой лад зоны, на котором эта нота есть', () => {
    expect(judgeNote(E_ON_SIXTH, GUITAR, 24, 40)).toMatchObject({ kind: 'correct', cell: { fret: 0 } })
    expect(judgeNote(E_ON_SIXTH, GUITAR, 24, 52)).toMatchObject({ kind: 'correct', cell: { fret: 12 } })
  })

  it('та же нота в другой октаве — не ответ: струна не та', () => {
    // F3 есть на пятой и четвёртой струнах, но не на шестой в пределах зоны.
    expect(judgeNote(F_ON_SIXTH, GUITAR, 24, 53)).toEqual({ kind: 'octave', midi: 53 })
  })

  it('неверная нота: на сколько ладов мимо и где она на этой струне', () => {
    expect(judgeNote(F_ON_SIXTH, GUITAR, 24, 43)).toEqual({
      kind: 'wrong',
      midi: 43,
      semitones: 2,
      cell: { stringIndex: 0, fret: 3, midi: 43 },
    })
    expect(judgeNote(F_ON_SIXTH, GUITAR, 24, 39)).toMatchObject({ semitones: -2, cell: null })
  })

  it('когда ответов два, мимо считается от ближайшего', () => {
    expect(judgeNote(E_ON_SIXTH, GUITAR, 24, 50)).toMatchObject({ kind: 'wrong', semitones: -2 })
    expect(judgeNote(E_ON_SIXTH, GUITAR, 24, 42)).toMatchObject({ kind: 'wrong', semitones: 2 })
  })
})
