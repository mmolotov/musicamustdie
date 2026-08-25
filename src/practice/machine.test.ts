import { describe, expect, it } from 'vitest'
import {
  currentStep,
  initialPracticeState,
  isSelfChecked,
  nextNeedleAngle,
  practiceReducer,
} from './machine'
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
    expect(currentStep(answering)).toBe('notes')
  })

  it('проходит все шаги раунда и возвращается к барабану', () => {
    const first = spinTo(initialPracticeState(5))
    expect(currentStep(first)).toBe('notes')

    const graded = practiceReducer(first, { type: 'answer', outcome: 'correct' })
    expect(graded.phase).toBe('revealed')
    expect(graded.tally).toEqual({ correct: 1, wrong: 0, skipped: 0 })

    const scale = practiceReducer(graded, { type: 'next' })
    expect(currentStep(scale)).toBe('scale')
    expect(scale.outcome).toBeNull()

    const chord = practiceReducer(
      practiceReducer(scale, { type: 'answer', outcome: 'skipped' }),
      { type: 'next' },
    )
    expect(currentStep(chord)).toBe('chord')

    const done = practiceReducer(
      practiceReducer(chord, { type: 'answer', outcome: 'wrong' }),
      { type: 'next' },
    )
    expect(done.phase).toBe('idle')
    expect(done.stepIndex).toBe(0)
    expect(done.tally).toEqual({ correct: 1, wrong: 1, skipped: 1 })
    // Тональность остаётся выбранной, чтобы круг не гас между раундами.
    expect(done.selection).toEqual(first.selection)
  })

  it('самопроверяемый шаг сначала раскрывается, а оценивается потом', () => {
    let state = spinTo(initialPracticeState(5))
    while (currentStep(state) !== 'scale') {
      state = practiceReducer(
        practiceReducer(state, { type: 'answer', outcome: 'correct' }),
        { type: 'next' },
      )
    }
    expect(isSelfChecked(currentStep(state))).toBe(true)
    const tallyBefore = state.tally

    const revealed = practiceReducer(state, { type: 'reveal' })
    expect(revealed.phase).toBe('revealed')
    expect(revealed.outcome).toBeNull()
    expect(revealed.tally).toEqual(tallyBefore)

    const graded = practiceReducer(revealed, { type: 'answer', outcome: 'wrong' })
    expect(graded.outcome).toBe('wrong')
    expect(graded.tally.wrong).toBe(tallyBefore.wrong + 1)
    // Второй раз тот же шаг не засчитывается.
    expect(practiceReducer(graded, { type: 'answer', outcome: 'correct' })).toBe(graded)
  })

  it('разыгрывает задание раунда вместе с тональностью', () => {
    const round = spinTo(initialPracticeState(101))
    expect(round.chordDegree).toBeGreaterThanOrEqual(1)
    expect(round.chordDegree).toBeLessThanOrEqual(7)
    expect(round.patternPick).toBeGreaterThanOrEqual(0)
    expect(round.patternPick).toBeLessThan(1)
    expect(spinTo(initialPracticeState(101))).toEqual(round)
  })

  it('игнорирует действия, пришедшие не в свою фазу', () => {
    const idle = initialPracticeState(3)
    expect(practiceReducer(idle, { type: 'answer', outcome: 'correct' })).toBe(idle)
    expect(practiceReducer(idle, { type: 'next' })).toBe(idle)
    expect(practiceReducer(idle, { type: 'spinEnded' })).toBe(idle)
    expect(practiceReducer(idle, { type: 'reveal' })).toBe(idle)

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
