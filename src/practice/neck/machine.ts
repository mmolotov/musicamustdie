import { drawCard } from './deck'
import { judgeNote } from './judge'
import type {
  NeckAction,
  NeckAttempt,
  NeckOutcome,
  NeckState,
  NeckTally,
  NeckVerdict,
} from './types'

/** Cards between two summaries. */
export const NECK_SERIES = 10

/**
 * How far off the open string may be at the sound check and still count as a
 * tuning rather than a mistake: E♭, D and C♯ standard, or a capo up to the
 * fourth fret.
 */
const MAX_TUNING_SHIFT = 4

export function initialNeckState(seed: number): NeckState {
  return {
    phase: 'idle',
    seed,
    openStrings: [],
    frets: 0,
    pool: [],
    bag: [],
    card: null,
    position: 0,
    revealed: false,
    mistakes: 0,
    verdict: null,
    shownAt: 0,
    activeAt: 0,
    transpose: 0,
    checkHeard: null,
    checkNagged: false,
    attempts: [],
    tally: { correct: 0, corrected: 0, revealed: 0 },
  }
}

/** Puts the next card up, or ends the series when it has run its length. */
function nextCard(state: NeckState, at: number): NeckState {
  if (state.position >= NECK_SERIES) return { ...state, phase: 'summary', card: null, verdict: null }
  // The summary has no card on screen, but the series still remembers its last.
  const previous = state.card ?? state.attempts.at(-1)?.card ?? null
  const draw = drawCard(state.seed, state.bag, state.pool, previous)
  if (!draw.card) return state
  return {
    ...state,
    phase: 'asking',
    seed: draw.seed,
    bag: draw.bag,
    card: draw.card,
    position: state.position + 1,
    revealed: false,
    mistakes: 0,
    verdict: null,
    shownAt: at,
    activeAt: at,
  }
}

function outcomeOf(state: NeckState): NeckOutcome {
  if (state.revealed) return 'revealed'
  return state.mistakes > 0 ? 'corrected' : 'correct'
}

function closeCard(
  state: NeckState,
  outcome: NeckOutcome,
  verdict: NeckVerdict | null,
  at: number,
): NeckState {
  if (!state.card) return state
  const attempt: NeckAttempt = {
    card: state.card,
    outcome,
    seconds: Math.max(0, at - state.shownAt) / 1000,
  }
  const tally: NeckTally = { ...state.tally, [outcome]: state.tally[outcome] + 1 }
  return { ...state, phase: 'solved', verdict, attempts: [...state.attempts, attempt], tally }
}

function soundCheck(state: NeckState, midi: number): NeckState {
  const expected = state.openStrings[0]
  if (expected === undefined) return state
  const offset = midi - expected
  // The same "wrong" note twice in a row is not a mistake, it is a guitar
  // tuned down or up: every target moves by that much and the session goes on.
  const retuned =
    offset !== 0 && Math.abs(offset) <= MAX_TUNING_SHIFT && state.checkHeard === midi
  if (offset === 0 || retuned) return { ...state, phase: 'ready', transpose: offset, checkHeard: midi }
  return { ...state, checkHeard: midi }
}

export function neckReducer(state: NeckState, action: NeckAction): NeckState {
  switch (action.type) {
    case 'begin': {
      if (state.phase !== 'idle' || action.pool.length === 0) return state
      return {
        ...initialNeckState(state.seed),
        phase: 'check',
        openStrings: action.openStrings,
        frets: action.frets,
        pool: action.pool,
        shownAt: action.at,
        activeAt: action.at,
      }
    }
    case 'heard': {
      if (state.phase === 'check') return soundCheck(state, action.midi)
      // Any note wakes a paused session or starts the next series; that note
      // is a signal, not an answer.
      if (state.phase === 'paused') {
        return { ...state, phase: 'asking', shownAt: action.at, activeAt: action.at }
      }
      if (state.phase === 'summary') {
        return { ...nextCard({ ...state, position: 0 }, action.at), attempts: [] }
      }
      if (state.phase !== 'asking' || !state.card) return state

      // Everything past this point speaks in the configured tuning; a retuned
      // guitar is brought back to it first.
      const verdict = judgeNote(
        state.card,
        state.openStrings,
        state.frets,
        action.midi - state.transpose,
      )
      if (verdict.kind === 'correct') return closeCard(state, outcomeOf(state), verdict, action.at)
      return { ...state, mistakes: state.mistakes + 1, verdict, activeAt: action.at }
    }
    case 'nag': {
      return state.phase === 'check' ? { ...state, checkNagged: true } : state
    }
    case 'hintDue': {
      return state.phase === 'asking' ? { ...state, revealed: true } : state
    }
    case 'skip': {
      if (state.phase !== 'asking') return state
      return nextCard(closeCard(state, 'revealed', null, action.at), action.at)
    }
    case 'advance': {
      if (state.phase !== 'ready' && state.phase !== 'solved') return state
      return nextCard(state, action.at)
    }
    case 'idle': {
      return state.phase === 'asking' ? { ...state, phase: 'paused' } : state
    }
    case 'zone': {
      if (action.pool.length === 0) return state
      // The pass through the old zone is over; the card on screen, if there is
      // one, is dealt again from the new zone without moving on in the series.
      const rezoned = { ...state, pool: action.pool, bag: [] }
      if (state.phase !== 'asking' && state.phase !== 'paused') return rezoned
      return nextCard({ ...rezoned, position: state.position - 1 }, action.at)
    }
    case 'stop': {
      return initialNeckState(state.seed)
    }
  }
}

export interface SeriesSummary {
  total: number
  /** Cards answered right away, with no wrong note and no hint. */
  clean: number
  /** Mean time of the clean ones, or null when there were none. */
  meanSeconds: number | null
}

export function summarize(attempts: readonly NeckAttempt[]): SeriesSummary {
  const clean = attempts.filter((attempt) => attempt.outcome === 'correct')
  return {
    total: attempts.length,
    clean: clean.length,
    meanSeconds:
      clean.length > 0
        ? clean.reduce((sum, attempt) => sum + attempt.seconds, 0) / clean.length
        : null,
  }
}
