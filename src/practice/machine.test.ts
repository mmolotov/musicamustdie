import { describe, expect, it } from 'vitest'
import { currentStep, initialPracticeState, nextNeedleAngle, practiceReducer } from './machine'
import type { PracticeState } from './types'

function spinTo(state: PracticeState): PracticeState {
  return practiceReducer(practiceReducer(state, { type: 'spin' }), { type: 'spinEnded' })
}

describe('машина состояний тренировки', () => {
  it('раунд начинается только после остановки стрелки', () => {
    const idle = initialPracticeState(11)
    expect(idle.phase).toBe('idle')
    expect(idle.selection).toBeNull()

    const spinning = practiceReducer(idle, { type: 'spin' })
    expect(spinning.phase).toBe('spinning')
    // Ключ уже разыгран, но ещё не показан.
    expect(spinning.pending).not.toBeNull()
    expect(spinning.selection).toBeNull()

    const answering = practiceReducer(spinning, { type: 'spinEnded' })
    expect(answering.phase).toBe('answering')
    expect(answering.selection).toEqual(spinning.pending)
    expect(answering.pending).toBeNull()
    expect(answering.round).toBe(1)
    expect(currentStep(answering)).toBe('signature')
  })

  it('проходит шаги раунда и возвращается к барабану', () => {
    const first = spinTo(initialPracticeState(5))

    const graded = practiceReducer(first, { type: 'answer', outcome: 'correct' })
    expect(graded.phase).toBe('revealed')
    expect(graded.tally).toEqual({ correct: 1, wrong: 0, skipped: 0 })

    const second = practiceReducer(graded, { type: 'next' })
    expect(second.phase).toBe('answering')
    expect(currentStep(second)).toBe('notes')
    expect(second.outcome).toBeNull()

    const skipped = practiceReducer(second, { type: 'answer', outcome: 'skipped' })
    expect(skipped.tally).toEqual({ correct: 1, wrong: 0, skipped: 1 })

    const done = practiceReducer(skipped, { type: 'next' })
    expect(done.phase).toBe('idle')
    expect(done.stepIndex).toBe(0)
    // Тональность остаётся выбранной, чтобы круг не гас между раундами.
    expect(done.selection).toEqual(first.selection)
  })

  it('игнорирует действия, пришедшие не в свою фазу', () => {
    const idle = initialPracticeState(3)
    expect(practiceReducer(idle, { type: 'answer', outcome: 'correct' })).toBe(idle)
    expect(practiceReducer(idle, { type: 'next' })).toBe(idle)
    expect(practiceReducer(idle, { type: 'spinEnded' })).toBe(idle)

    const spinning = practiceReducer(idle, { type: 'spin' })
    expect(practiceReducer(spinning, { type: 'spin' })).toBe(spinning)
  })

  it('второй раунд выпадает на другую тональность', () => {
    const first = spinTo(initialPracticeState(77))
    const second = spinTo(first)
    expect(second.selection).not.toEqual(first.selection)
    expect(second.round).toBe(2)
  })
})

describe('угол стрелки', () => {
  it('всегда крутится вперёд и встаёт на свой сектор', () => {
    let angle = 0
    for (let sectorIndex = 0; sectorIndex < 12; sectorIndex += 1) {
      const next = nextNeedleAngle(angle, sectorIndex)
      expect(next).toBeGreaterThan(angle)
      expect(next % 360).toBe(sectorIndex * 30)
      angle = next
    }
  })

  it('делает полные обороты даже когда сектор не меняется', () => {
    const first = nextNeedleAngle(0, 4)
    const again = nextNeedleAngle(first, 4)
    expect(again - first).toBe(4 * 360)
  })
})
