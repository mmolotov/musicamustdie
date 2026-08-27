import { drawKey } from './keys'
import { nextInt, nextRandom } from './rng'
import type { PracticeAction, PracticeState, PracticeStepId, PracticeTally, StepOutcome } from './types'

// The two fretboard steps sit next to each other on purpose: the round works
// through the neck in one go instead of being split by the harmony question.
export const PRACTICE_STEPS: readonly PracticeStepId[] = ['notes', 'scale', 'pentatonic', 'chord']

/**
 * Steps the player performs rather than answers: the assignment is the
 * question, so the workspace shows it up front, and the grade comes from the
 * player — the app cannot hear the guitar.
 */
export const SELF_CHECKED_STEPS: readonly PracticeStepId[] = ['scale', 'pentatonic']

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
    pentatonicPick: 0,
    steps: PRACTICE_STEPS,
    stepIndex: 0,
    reachedIndex: 0,
    outcomes: PRACTICE_STEPS.map(() => null),
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

interface RoundAssignment {
  seed: number
  chordDegree: number
  patternPick: number
  pentatonicPick: number
}

/**
 * The rest of a round: which degree the chord step asks about, which shape the
 * scale step assigns and which box the pentatonic step assigns. Drawn together
 * with the key so the whole round replays from one seed.
 */
function drawAssignment(seed: number): RoundAssignment {
  const degree = nextInt(seed, 7)
  const pattern = nextRandom(degree.seed)
  const box = nextRandom(pattern.seed)
  return {
    seed: box.seed,
    chordDegree: degree.value + 1,
    patternPick: pattern.value,
    pentatonicPick: box.value,
  }
}

function bumpTally(tally: PracticeTally, outcome: StepOutcome): PracticeTally {
  return { ...tally, [outcome]: tally[outcome] + 1 }
}

function clearOutcomes(steps: readonly PracticeStepId[]): (StepOutcome | null)[] {
  return steps.map(() => null)
}

/** How the step at `stepIndex` should be shown: graded steps open revealed. */
function phaseForStep(
  outcomes: readonly (StepOutcome | null)[],
  stepIndex: number,
): 'answering' | 'revealed' {
  return outcomes[stepIndex] != null ? 'revealed' : 'answering'
}

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case 'spin': {
      if (state.phase === 'spinning') return state
      const key = drawKey(state.seed, state.selection)
      const assignment = drawAssignment(key.seed)
      return {
        ...state,
        phase: 'spinning',
        seed: assignment.seed,
        pending: key.key.selection,
        needleAngle: nextNeedleAngle(state.needleAngle, key.key.sectorIndex),
        chordDegree: assignment.chordDegree,
        patternPick: assignment.patternPick,
        pentatonicPick: assignment.pentatonicPick,
        stepIndex: 0,
        reachedIndex: 0,
        outcomes: clearOutcomes(state.steps),
      }
    }
    case 'pick': {
      // A chosen key needs no wheel: the needle takes the short way round and
      // the round starts at once, from whatever the player was doing before.
      const assignment = drawAssignment(state.seed)
      return {
        ...state,
        phase: 'answering',
        seed: assignment.seed,
        selection: action.selection,
        pending: null,
        needleAngle: nextNeedleAngle(state.needleAngle, action.sectorIndex, 0),
        chordDegree: assignment.chordDegree,
        patternPick: assignment.patternPick,
        pentatonicPick: assignment.pentatonicPick,
        round: state.round + 1,
        stepIndex: 0,
        reachedIndex: 0,
        outcomes: clearOutcomes(state.steps),
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
      return { ...state, phase: 'revealed' }
    }
    case 'answer': {
      // Graded either straight from the question, or afterwards on a step the
      // player checks against the revealed answer themselves. A step already
      // graded stays as it was — walking back through a round must not let the
      // same answer land in the tally twice.
      const graded = currentOutcome(state)
      const gradable =
        graded === null && (state.phase === 'answering' || state.phase === 'revealed')
      if (!gradable) return state
      return {
        ...state,
        phase: 'revealed',
        outcomes: state.outcomes.map((outcome, index) =>
          index === state.stepIndex ? action.outcome : outcome,
        ),
        tally: bumpTally(state.tally, action.outcome),
      }
    }
    case 'next': {
      if (state.phase !== 'revealed') return state
      const stepIndex = state.stepIndex + 1
      if (stepIndex >= state.steps.length) {
        return {
          ...state,
          phase: 'idle',
          stepIndex: 0,
          reachedIndex: 0,
          outcomes: clearOutcomes(state.steps),
        }
      }
      // Coming forward again after a look back lands on a step that is already
      // graded, and it opens on its answer rather than asking twice.
      return {
        ...state,
        phase: phaseForStep(state.outcomes, stepIndex),
        stepIndex,
        reachedIndex: Math.max(state.reachedIndex, stepIndex),
      }
    }
    case 'goToStep': {
      // Anywhere this round has already been — no further. Jumping ahead of
      // that would hand over an answer the round never asked for.
      const { stepIndex } = action
      const inRound = state.phase === 'answering' || state.phase === 'revealed'
      if (!inRound || stepIndex === state.stepIndex) return state
      if (stepIndex < 0 || stepIndex > state.reachedIndex) return state
      return { ...state, phase: phaseForStep(state.outcomes, stepIndex), stepIndex }
    }
  }
}

export function currentStep(state: PracticeState): PracticeStepId | null {
  return state.steps[state.stepIndex] ?? null
}

/** The grade of the step on screen, or null while it is still a question. */
export function currentOutcome(state: PracticeState): StepOutcome | null {
  return state.outcomes[state.stepIndex] ?? null
}

/** Steps the round has already opened — the ones it can be walked back to. */
export function canVisitStep(state: PracticeState, stepIndex: number): boolean {
  return stepIndex <= state.reachedIndex
}
