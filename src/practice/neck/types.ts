/** Which stretch of the neck a session covers. */
export type FretSpan = 'first' | 'low' | 'high' | 'all'

export type NotePool = 'natural' | 'all'

/** What the player chose to work on today. */
export interface NeckZone {
  /** String indexes the way the instrument config counts them: 0 is the lowest. */
  strings: number[]
  span: FretSpan
  pool: NotePool
}

/** One position on the neck. */
export interface NeckCell {
  stringIndex: number
  fret: number
  midi: number
}

/** A question: this note on this string. */
export interface NeckCard {
  stringIndex: number
  pitchClass: number
  /**
   * Every fret of the zone where that note sits on that string. Usually one;
   * two when the zone holds both the open string and its twelfth fret.
   */
  answers: NeckCell[]
}

export type NeckVerdict =
  | { kind: 'correct'; cell: NeckCell }
  /** The right note name in an octave the zone does not have on that string. */
  | { kind: 'octave'; midi: number }
  | {
      kind: 'wrong'
      midi: number
      /** Heard minus wanted: positive means the player has to go down. */
      semitones: number
      /** Where the heard pitch sits on the asked string, if it fits the neck. */
      cell: NeckCell | null
    }

/** How a card ended: straight away, after a wrong note, or after the hint. */
export type NeckOutcome = 'correct' | 'corrected' | 'revealed'

export interface NeckAttempt {
  card: NeckCard
  outcome: NeckOutcome
  seconds: number
}

export interface NeckTally {
  correct: number
  corrected: number
  revealed: number
}

export type NeckPhase =
  | 'idle'
  /** Sound check: waiting for the lowest open string. */
  | 'check'
  /** Sound check passed; the first card is about to go up. */
  | 'ready'
  | 'asking'
  | 'solved'
  | 'paused'
  | 'summary'

export interface NeckState {
  phase: NeckPhase
  /** mulberry32 state, threaded the same way the key round threads it. */
  seed: number
  openStrings: readonly number[]
  frets: number
  /** Every card of the chosen zone. */
  pool: NeckCard[]
  /** What is left of the current pass through the pool. */
  bag: NeckCard[]
  card: NeckCard | null
  /** 1-based place of the card in the series; 0 before the first one. */
  position: number
  revealed: boolean
  mistakes: number
  /** The last note judged on this card — feeds the feedback line and the mark. */
  verdict: NeckVerdict | null
  /** When the card went up, in milliseconds on the caller's clock. */
  shownAt: number
  /** The last time anything was played; the silence pause counts from here. */
  activeAt: number
  /** Semitones the instrument is tuned away from its configured tuning. */
  transpose: number
  /** What the sound check heard last, when it was not the expected string. */
  checkHeard: number | null
  checkNagged: boolean
  /** Cards of the series in progress. */
  attempts: NeckAttempt[]
  /** The whole session. */
  tally: NeckTally
}

export type NeckAction =
  | { type: 'begin'; pool: NeckCard[]; openStrings: readonly number[]; frets: number; at: number }
  | { type: 'heard'; midi: number; at: number }
  /** The sound check has waited long enough to say what usually helps. */
  | { type: 'nag' }
  | { type: 'hintDue' }
  /** Gives the card up: it counts as one that needed the hint. */
  | { type: 'skip'; at: number }
  | { type: 'advance'; at: number }
  /** Nothing played for a while. */
  | { type: 'idle' }
  | { type: 'zone'; pool: NeckCard[]; at: number }
  | { type: 'stop' }
