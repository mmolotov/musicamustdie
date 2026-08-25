import type { ChordDefinition, ScaleNote } from '../music/types'
import type { ChordAnswer, TriadQuality } from './types'

export const NOTE_SLOT_COUNT = 7

export type NoteSlots = readonly (number | null)[]

export function emptyNoteSlots(): NoteSlots {
  return Array.from({ length: NOTE_SLOT_COUNT }, () => null)
}

export function expectedPitchClasses(notes: ScaleNote[]): number[] {
  return notes.map((note) => note.pitchClass)
}

/** Per-slot correctness, so a wrong answer can point at the degree that slipped. */
export function checkNoteSlots(entered: NoteSlots, expected: number[]): boolean[] {
  return expected.map((pitchClass, index) => entered[index] === pitchClass)
}

export function noteSlotsFilled(entered: NoteSlots): boolean {
  return entered.every((slot) => slot !== null)
}

export const TRIAD_QUALITIES: readonly TriadQuality[] = [
  'major',
  'minor',
  'diminished',
  'augmented',
]

/**
 * The chord step asks for a root and a quality, so that is all it grades —
 * the spelling of the root (D♯ or E♭) is taught by the revealed answer, the
 * same way the note step handles it.
 */
export function checkChord(chord: ChordDefinition, answer: ChordAnswer): boolean {
  return chord.root.pitchClass === answer.root && chord.quality === answer.quality
}
