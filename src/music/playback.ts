import type { ScaleNote } from './types'
import { mod } from './theory'

export function midiNearMiddleC(pitchClass: number): number {
  return 60 + mod(pitchClass)
}

/**
 * Places scale degrees into one ascending octave starting from the tonic.
 * Pitch classes alone are not enough here: a scale such as G major crosses
 * the C4/C5 boundary between B and C.
 */
export function ascendingScaleMidis(notes: ScaleNote[]): number[] {
  const tonic = notes[0]
  if (!tonic) return []
  const tonicMidi = midiNearMiddleC(tonic.pitchClass)
  return notes.map((note) => tonicMidi + note.interval)
}
