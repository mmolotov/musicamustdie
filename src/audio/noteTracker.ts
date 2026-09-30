import { MIN_CLARITY, midiFromFreq, type PitchFrame } from './pitch'

/**
 * How much brighter the newest stretch of the buffer is than the one before
 * it: the energy of the first difference, last half against first half. A pick
 * attack is a burst of highs, so this jumps even when a string is re-picked
 * while it still rings and the overall level barely moves.
 */
export function attackRatio(buffer: Float32Array): number {
  const half = buffer.length >> 1
  let before = 0
  let after = 0
  for (let i = 1; i < half; i += 1) {
    const d = (buffer[i] ?? 0) - (buffer[i - 1] ?? 0)
    before += d * d
  }
  for (let i = half + 1; i < buffer.length; i += 1) {
    const d = (buffer[i] ?? 0) - (buffer[i - 1] ?? 0)
    after += d * d
  }
  if (before > 0) return after / before
  return after > 0 ? Infinity : 1
}

export interface TrackerFrame extends PitchFrame {
  /** Seconds on any steady clock; only differences matter. */
  time: number
  /** `attackRatio()` of the newest unfiltered samples. */
  attack?: number
}

export interface NoteEvent {
  midi: number
  /** Mean deviation from the tempered pitch while the note settled. */
  cents: number
  time: number
  rms: number
}

export interface NoteTracker {
  push: (frame: TrackerFrame) => NoteEvent | null
  /** Feeds the quiet stretch before the first note, to place the gate. */
  calibrate: (rms: number) => void
  readonly gate: number
}

export interface NoteTrackerOptions {
  /** How long a pitch has to hold before it counts as played. */
  stableMs?: number
  minClarity?: number
  /**
   * The gate never drops below this. An unplugged electric half a metre from
   * a laptop is quiet, so the floor sits well under it and the room decides
   * the rest.
   */
  minGate?: number
  gateOverNoise?: number
  /** Level jump, newest frame against the quietest recent one, that is an attack. */
  onsetRatio?: number
  /** `attackRatio()` above this is an attack even when the level did not jump. */
  attackThreshold?: number
  /** Share of the attack's peak a note needs to be accepted without a new attack. */
  sustainShare?: number
  maxCents?: number
}

interface Candidate {
  midi: number
  count: number
  centsSum: number
  since: number
}

/** Frames kept for the noise floor: about six seconds at a 20 ms hop. */
const FLOOR_HISTORY = 300
const FLOOR_REFIT_EVERY = 50

/**
 * Turns a stream of analysis frames into "a note was played" events.
 *
 * - A pitch has to hold for `stableMs` before it counts.
 * - One event per attack: a ringing note is not reported again, a re-picked
 *   one is, and so is a slide to another fret while the string is still loud.
 * - Quiet leftovers — sympathetic strings after the hand lets go — are ignored:
 *   they have neither an attack nor the level of the note that excited them.
 */
export function createNoteTracker({
  stableMs = 45,
  minClarity = MIN_CLARITY,
  minGate = 0.001,
  gateOverNoise = 2.5,
  onsetRatio = 1.7,
  attackThreshold = 2.2,
  sustainShare = 0.35,
  maxCents = 45,
}: NoteTrackerOptions = {}): NoteTracker {
  let noiseFloor = 0
  let calibrationFrames = 0
  let gate = minGate
  const recentRms: number[] = []
  const history: number[] = []
  let sinceRefit = 0
  let candidate: Candidate | null = null
  let latched: number | null = null
  let onsetPending = false
  let onsetPeak = 0

  const placeGate = () => {
    gate = Math.max(minGate, noiseFloor * gateOverNoise)
  }

  const calibrate = (rms: number) => {
    calibrationFrames += 1
    noiseFloor += (rms - noiseFloor) / calibrationFrames
    placeGate()
  }

  // The room changes and the first second may have caught the player
  // mid-strum, so the floor keeps following the quietest tenth of the last few
  // seconds — the gaps between notes.
  const follow = (rms: number) => {
    history.push(rms)
    if (history.length > FLOOR_HISTORY) history.shift()
    sinceRefit += 1
    if (history.length < FLOOR_HISTORY / 3 || sinceRefit < FLOOR_REFIT_EVERY) return
    sinceRefit = 0
    const sorted = [...history].sort((a, b) => a - b)
    noiseFloor = sorted[Math.floor(sorted.length * 0.1)] ?? noiseFloor
    placeGate()
  }

  const push = ({ rms, freq, clarity, time, attack = 1 }: TrackerFrame): NoteEvent | null => {
    follow(rms)
    const quietestRecent = recentRms.length > 0 ? Math.min(...recentRms) : rms
    recentRms.push(rms)
    if (recentRms.length > 4) recentRms.shift()

    if (rms > gate && (rms > quietestRecent * onsetRatio || attack > attackThreshold)) {
      onsetPending = true
      onsetPeak = rms
      latched = null
      candidate = null
    }
    if (onsetPending && rms > onsetPeak) onsetPeak = rms
    if (rms < gate * 0.7) {
      latched = null
      candidate = null
      onsetPending = false
      return null
    }

    if (freq === null || clarity < minClarity || rms < gate) {
      candidate = null
      return null
    }
    const exact = midiFromFreq(freq)
    const midi = Math.round(exact)
    const cents = (exact - midi) * 100
    if (Math.abs(cents) > maxCents) {
      candidate = null
      return null
    }

    if (candidate && candidate.midi === midi) {
      candidate.count += 1
      candidate.centsSum += cents
    } else {
      candidate = { midi, count: 1, centsSum: cents, since: time }
    }
    const heldMs = (time - candidate.since) * 1000
    if (candidate.count < 2 || heldMs < stableMs || latched === midi) return null

    const loudEnough = rms >= onsetPeak * sustainShare
    if (!onsetPending && !loudEnough) return null

    latched = midi
    onsetPending = false
    return { midi, cents: candidate.centsSum / candidate.count, time, rms }
  }

  return {
    push,
    calibrate,
    get gate() {
      return gate
    },
  }
}
