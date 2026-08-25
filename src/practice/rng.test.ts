import { describe, expect, it } from 'vitest'
import { nextInt, nextRandom } from './rng'

describe('генератор случайных чисел тренировки', () => {
  it('повторяет одну и ту же последовательность для одного зерна', () => {
    const run = (seed: number) => {
      let state = seed
      return Array.from({ length: 8 }, () => {
        const draw = nextRandom(state)
        state = draw.seed
        return draw.value
      })
    }

    expect(run(42)).toEqual(run(42))
    expect(run(42)).not.toEqual(run(43))
  })

  it('держится в диапазоне [0, 1)', () => {
    let state = 7
    for (let index = 0; index < 500; index += 1) {
      const draw = nextRandom(state)
      state = draw.seed
      expect(draw.value).toBeGreaterThanOrEqual(0)
      expect(draw.value).toBeLessThan(1)
    }
  })

  it('nextInt не выходит за границу', () => {
    let state = 1234
    for (let index = 0; index < 500; index += 1) {
      const draw = nextInt(state, 24)
      state = draw.seed
      expect(Number.isInteger(draw.value)).toBe(true)
      expect(draw.value).toBeGreaterThanOrEqual(0)
      expect(draw.value).toBeLessThan(24)
    }
  })
})
