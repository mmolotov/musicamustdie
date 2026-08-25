import { getKeySignature } from '../music/theory'
import type { ChordDefinition, KeySelection, KeySignature, ScaleNote } from '../music/types'
import type { ChordAnswer, SignatureAnswer, TriadQuality } from './types'

export const NOTE_SLOT_COUNT = 7

export type NoteSlots = readonly (number | null)[]

export function emptyNoteSlots(): NoteSlots {
  return Array.from({ length: NOTE_SLOT_COUNT }, () => null)
}

/**
 * Every signature that counts as right. Enharmonic keys have two: F♯ major is
 * six sharps and G♭ major is six flats, and a player who answers either one
 * knows the key. Flipping the spelling produces the alternative and collapses
 * back to a single answer for the other nine sectors.
 */
export function acceptedSignatures(selection: KeySelection): KeySignature[] {
  const primary = getKeySignature(selection)
  const alternative = getKeySignature({
    ...selection,
    spelling: selection.spelling === 'sharp' ? 'flat' : 'sharp',
  })
  const isSame = primary.count === alternative.count && primary.accidental === alternative.accidental
  return isSame ? [primary] : [primary, alternative]
}

export function checkSignature(selection: KeySelection, answer: SignatureAnswer): boolean {
  // Zero accidentals has no sharp/flat half, whatever the kind toggle says.
  const accidental = answer.count === 0 ? 'natural' : answer.accidental
  return acceptedSignatures(selection).some(
    (signature) => signature.count === answer.count && signature.accidental === accidental,
  )
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
