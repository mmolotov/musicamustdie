import type { KeySelection } from '../music/types'

export type PracticeStepId = 'notes' | 'scale' | 'pentatonic' | 'chord'

/** The four triad qualities diatonic harmony can produce. */
export type TriadQuality = 'major' | 'minor' | 'diminished' | 'augmented'

export interface ChordAnswer {
  root: number
  quality: TriadQuality
}

export type StepOutcome = 'correct' | 'wrong' | 'skipped'

export type PracticePhase = 'idle' | 'spinning' | 'answering' | 'revealed'

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
  /** Scale degree the chord step asks about (1-based), drawn with the key. */
  chordDegree: number
  /** Picks the fingering the scale step assigns; the instrument resolves it. */
  patternPick: number
  /** Picks the box the pentatonic step assigns, drawn apart from the shape. */
  pentatonicPick: number
  steps: readonly PracticeStepId[]
  stepIndex: number
  /** The outcome of the step being reviewed; null while answering. */
  outcome: StepOutcome | null
  tally: PracticeTally
}

export type PracticeAction =
  | { type: 'spin' }
  | { type: 'spinEnded' }
  /** Starts a round on a key the player chose, skipping the wheel. */
  | { type: 'pick'; selection: KeySelection; sectorIndex: number }
  /** Shows the answer without grading it — the self-checked fretboard step. */
  | { type: 'reveal' }
  | { type: 'answer'; outcome: StepOutcome }
  | { type: 'next' }
