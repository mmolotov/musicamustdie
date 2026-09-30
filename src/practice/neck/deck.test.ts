import { describe, expect, it } from 'vitest'
import { drawCard, sameCard } from './deck'
import { zoneCards } from './zone'
import type { NeckCard } from './types'

const GUITAR = [40, 45, 50, 55, 59, 64]
const TWO_STRINGS = zoneCards(GUITAR, 24, { strings: [0, 1], span: 'low', pool: 'natural' })

const key = (card: NeckCard | null) => (card ? `${card.stringIndex}:${card.pitchClass}` : 'none')

/** The first `count` cards a session would see. */
function deal(seed: number, pool: readonly NeckCard[], count: number): (NeckCard | null)[] {
  const cards: (NeckCard | null)[] = []
  let bag: NeckCard[] = []
  let nextSeed = seed
  for (let i = 0; i < count; i += 1) {
    const draw = drawCard(nextSeed, bag, pool, cards.at(-1) ?? null)
    cards.push(draw.card)
    bag = draw.bag
    nextSeed = draw.seed
  }
  return cards
}

describe('мешок карточек', () => {
  it('за один проход каждая позиция зоны спрашивается ровно один раз', () => {
    const pass = deal(7, TWO_STRINGS, TWO_STRINGS.length)
    expect(new Set(pass.map(key)).size).toBe(TWO_STRINGS.length)

    // Следующая карточка открывает новый проход.
    const draw = drawCard(7, [], TWO_STRINGS, null)
    expect(draw.bag).toHaveLength(TWO_STRINGS.length - 1)
  })

  it('на стыке двух проходов позиция не повторяется', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const cards = deal(seed, TWO_STRINGS, TWO_STRINGS.length + 1)
      expect(sameCard(cards.at(-1) ?? null, cards.at(-2) ?? null)).toBe(false)
    }
  })

  it('один seed даёт одну и ту же раздачу, разные — разную', () => {
    expect(deal(11, TWO_STRINGS, 20).map(key)).toEqual(deal(11, TWO_STRINGS, 20).map(key))
    expect(deal(11, TWO_STRINGS, 20).map(key)).not.toEqual(deal(12, TWO_STRINGS, 20).map(key))
  })

  it('зона из одной карточки просто повторяет её, пустая не даёт ничего', () => {
    const single = TWO_STRINGS.slice(0, 1)
    expect(deal(3, single, 3).map(key)).toEqual(['0:4', '0:4', '0:4'])
    expect(drawCard(3, [], [], null).card).toBeNull()
  })
})
