import type { KeySelection } from '../music/types'
import {
  CIRCLE_MAJOR_PITCHES,
  defaultSpellingForMajorPitch,
  getRelativeMinorPitch,
} from '../music/theory'
import { nextInt } from './rng'

export interface CircleKey {
  selection: KeySelection
  /** Index into CIRCLE_MAJOR_PITCHES — also the wedge the needle points at. */
  sectorIndex: number
}

/**
 * Every key the wheel can land on: the same 24 the circle offers, spelled the
 * same way clicking a wedge would spell them.
 */
export const CIRCLE_KEYS: readonly CircleKey[] = CIRCLE_MAJOR_PITCHES.flatMap(
  (majorPitch, sectorIndex) => {
    const spelling = defaultSpellingForMajorPitch(majorPitch)
    return [
      { selection: { tonic: majorPitch, mode: 'major', spelling }, sectorIndex },
      { selection: { tonic: getRelativeMinorPitch(majorPitch), mode: 'minor', spelling }, sectorIndex },
    ] satisfies CircleKey[]
  },
)

function isSameKey(a: KeySelection, b: KeySelection): boolean {
  return a.tonic === b.tonic && a.mode === b.mode
}

/** Which wedge a key sits on — the needle points at sectors, not at keys. */
export function sectorIndexOf(selection: KeySelection): number {
  return CIRCLE_KEYS.find((candidate) => isSameKey(candidate.selection, selection))?.sectorIndex ?? 0
}

export interface KeyDraw {
  key: CircleKey
  seed: number
}

/**
 * Draws the next key of a round. The previous key is taken out of the pool
 * first: landing on the same tonality twice in a row reads as a broken wheel
 * even though it is perfectly random.
 */
export function drawKey(seed: number, previous: KeySelection | null): KeyDraw {
  const pool = previous
    ? CIRCLE_KEYS.filter((candidate) => !isSameKey(candidate.selection, previous))
    : CIRCLE_KEYS
  const draw = nextInt(seed, pool.length)
  const key = pool[draw.value] ?? pool[0]
  if (!key) throw new Error('The circle of fifths has no keys to draw from')
  return { key, seed: draw.seed }
}
