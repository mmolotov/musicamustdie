import { drawKey } from './keys'
import type { PracticeAction, PracticeState, PracticeStepId, PracticeTally, StepOutcome } from './types'

export const PRACTICE_STEPS: readonly PracticeStepId[] = ['signature', 'notes']

/** Full turns the needle makes before settling on its wedge. */
const SPIN_TURNS = 4

const SECTOR_DEGREES = 30

export function initialPracticeState(seed: number): PracticeState {
  return {
    phase: 'idle',
    seed,
    round: 0,
    selection: null,
    pending: null,
    needleAngle: 0,
    steps: PRACTICE_STEPS,
    stepIndex: 0,
    outcome: null,
    tally: { correct: 0, wrong: 0, skipped: 0 },
  }
}

/**
 * The next absolute rotation for the needle. CSS interpolates between the old
 * and the new value, so the angle has to keep climbing — rewinding to a small
 * number would spin the needle backwards.
 */
export function nextNeedleAngle(current: number, sectorIndex: number, turns = SPIN_TURNS): number {
  const target = sectorIndex * SECTOR_DEGREES
  const delta = (((target - current) % 360) + 360) % 360
  return current + turns * 360 + delta
}

function bumpTally(tally: PracticeTally, outcome: StepOutcome): PracticeTally {
  return { ...tally, [outcome]: tally[outcome] + 1 }
}

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case 'spin': {
      if (state.phase === 'spinning') return state
      const draw = drawKey(state.seed, state.selection)
      return {
        ...state,
        phase: 'spinning',
        seed: draw.seed,
        pending: draw.key.selection,
        needleAngle: nextNeedleAngle(state.needleAngle, draw.key.sectorIndex),
        stepIndex: 0,
        outcome: null,
      }
    }
    case 'spinEnded': {
      if (state.phase !== 'spinning' || !state.pending) return state
      return {
        ...state,
        phase: 'answering',
        selection: state.pending,
        pending: null,
        round: state.round + 1,
      }
    }
    case 'answer': {
      if (state.phase !== 'answering') return state
      return {
        ...state,
        phase: 'revealed',
        outcome: action.outcome,
        tally: bumpTally(state.tally, action.outcome),
      }
    }
    case 'next': {
      if (state.phase !== 'revealed') return state
      const stepIndex = state.stepIndex + 1
      if (stepIndex >= state.steps.length) {
        return { ...state, phase: 'idle', stepIndex: 0, outcome: null }
      }
      return { ...state, phase: 'answering', stepIndex, outcome: null }
    }
  }
}

export function currentStep(state: PracticeState): PracticeStepId | null {
  return state.steps[state.stepIndex] ?? null
}
