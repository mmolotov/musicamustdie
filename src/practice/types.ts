import type { KeySelection } from '../music/types'

/**
 * Steps of a practice round. The fretboard ("play the scale") and chord steps
 * join this union together with their question UI.
 */
export type PracticeStepId = 'signature' | 'notes'

export type StepOutcome = 'correct' | 'wrong' | 'skipped'

export type PracticePhase = 'idle' | 'spinning' | 'answering' | 'revealed'

export type SignatureKind = 'sharp' | 'flat' | 'natural'

export interface SignatureAnswer {
  count: number
  accidental: SignatureKind
}

export interface PracticeTally {
  correct: number
  wrong: number
  skipped: number
}

export interface PracticeState {
  phase: PracticePhase
  /** mulberry32 state; see rng.ts for why it lives in the reducer. */
  seed: number
  /** 0 until the first needle lands. */
  round: number
  /** The key being drilled. Kept after a round ends so the circle stays lit. */
  selection: KeySelection | null
  /** Drawn when the wheel starts, withheld until the needle lands. */
  pending: KeySelection | null
  /** Grows without bound so the CSS transition always turns forwards. */
  needleAngle: number
  steps: readonly PracticeStepId[]
  stepIndex: number
  /** The outcome of the step being reviewed; null while answering. */
  outcome: StepOutcome | null
  tally: PracticeTally
}

export type PracticeAction =
  | { type: 'spin' }
  | { type: 'spinEnded' }
  | { type: 'answer'; outcome: StepOutcome }
  | { type: 'next' }
