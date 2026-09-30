import { mod } from '../../music/theory'
import type { NeckCard, NeckVerdict } from './types'

/**
 * Compares a heard pitch with a card. The microphone cannot tell which string
 * was played, so a card is answered by pitch and octave: the right pitch on
 * another string passes, the right note name an octave off does not.
 */
export function judgeNote(
  card: NeckCard,
  openStrings: readonly number[],
  frets: number,
  heardMidi: number,
): NeckVerdict {
  const hit = card.answers.find((cell) => cell.midi === heardMidi)
  if (hit) return { kind: 'correct', cell: hit }
  if (mod(heardMidi) === card.pitchClass) return { kind: 'octave', midi: heardMidi }

  const nearest = card.answers.reduce<number | null>(
    (best, cell) =>
      best === null || Math.abs(heardMidi - cell.midi) < Math.abs(heardMidi - best)
        ? cell.midi
        : best,
    null,
  )
  const open = openStrings[card.stringIndex]
  const fret = open === undefined ? -1 : heardMidi - open
  return {
    kind: 'wrong',
    midi: heardMidi,
    semitones: nearest === null ? 0 : heardMidi - nearest,
    cell:
      fret >= 0 && fret <= frets ? { stringIndex: card.stringIndex, fret, midi: heardMidi } : null,
  }
}
