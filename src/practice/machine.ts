import { drawKey } from './keys'
import { nextInt, nextRandom } from './rng'
import type { PracticeAction, PracticeState, PracticeStepId, PracticeTally, StepOutcome } from './types'

export const PRACTICE_STEPS: readonly PracticeStepId[] = ['signature', 'notes', 'scale', 'chord']

/** Steps the player grades themselves — the app cannot hear the guitar. */
export const SELF_CHECKED_STEPS: readonly PracticeStepId[] = ['scale']

export function isSelfChecked(step: PracticeStepId | null): boolean {
  return step !== null && SELF_CHECKED_STEPS.includes(step)
}

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
    chordDegree: 1,
    patternPick: 0,
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
      // The whole round is drawn at once so every step of it replays from the
      // same seed: the key, the degree the chord step asks about, and the
      // fingering the scale step assigns.
      const key = drawKey(state.seed, state.selection)
      const degree = nextInt(key.seed, 7)
      const pattern = nextRandom(degree.seed)
      return {
        ...state,
        phase: 'spinning',
        seed: pattern.seed,
        pending: key.key.selection,
        needleAngle: nextNeedleAngle(state.needleAngle, key.key.sectorIndex),
        chordDegree: degree.value + 1,
        patternPick: pattern.value,
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
    case 'reveal': {
      if (state.phase !== 'answering') return state
      return { ...state, phase: 'revealed', outcome: null }
    }
    case 'answer': {
      // Graded either straight from the question, or afterwards on a step the
      // player checks against the revealed answer themselves.
      const gradable = state.phase === 'answering' || (state.phase === 'revealed' && state.outcome === null)
      if (!gradable) return state
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
