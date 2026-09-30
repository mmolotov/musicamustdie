import { nextInt } from '../rng'
import type { NeckCard } from './types'

export function sameCard(a: NeckCard | null, b: NeckCard | null): boolean {
  return a !== null && b !== null && a.stringIndex === b.stringIndex && a.pitchClass === b.pitchClass
}

export interface CardDraw {
  /** Null only when the zone has no cards at all. */
  card: NeckCard | null
  bag: NeckCard[]
  seed: number
}

/**
 * Takes the next card out of a shuffled bag: every position of the zone is
 * asked once before any is asked again. On one string a zone is seven notes,
 * and plain random draws would keep repeating three of them.
 */
export function drawCard(
  seed: number,
  bag: readonly NeckCard[],
  pool: readonly NeckCard[],
  previous: NeckCard | null,
): CardDraw {
  let rest = [...bag]
  let nextSeed = seed

  if (rest.length === 0) {
    rest = [...pool]
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const draw = nextInt(nextSeed, i + 1)
      nextSeed = draw.seed
      const a = rest[i]
      const b = rest[draw.value]
      if (a === undefined || b === undefined) continue
      rest[i] = b
      rest[draw.value] = a
    }
    // Not the same position twice in a row across two passes of the bag.
    const first = rest[0]
    if (first !== undefined && rest.length > 1 && sameCard(first, previous)) {
      rest.push(first)
      rest.shift()
    }
  }

  const card = rest.shift() ?? null
  return { card, bag: rest, seed: nextSeed }
}
