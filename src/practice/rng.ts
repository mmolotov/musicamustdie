/**
 * mulberry32 with the generator state passed in and out instead of captured in
 * a closure. Threading the state through the practice reducer keeps rounds
 * reproducible: the same `?seed=` always draws the same sequence of keys,
 * which is what the unit tests and the Playwright suite rely on.
 */
export interface RandomDraw {
  value: number
  seed: number
}

export function nextRandom(seed: number): RandomDraw {
  const state = (seed + 0x6d2b79f5) | 0
  let x = state
  x = Math.imul(x ^ (x >>> 15), x | 1)
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
  return { value: ((x ^ (x >>> 14)) >>> 0) / 4294967296, seed: state }
}

/** A whole number in `[0, bound)`. */
export function nextInt(seed: number, bound: number): RandomDraw {
  const draw = nextRandom(seed)
  return { value: Math.floor(draw.value * bound), seed: draw.seed }
}
