import type { BuiltScale, KeySelection, ScaleNote, SpelledNote } from './types'
import {
  alterNote,
  buildScale,
  getRelativeMajorPitch,
  getRelativeMinorPitch,
  mod,
  scaleFormula,
} from './theory'
import { getLang, type Lang } from '../i18n'

export type PentatonicFlavor = 'minor' | 'major'

/**
 * Which degrees of the parent seven-note scale survive. The minor pentatonic
 * keeps 1 ♭3 4 5 ♭7, the major one keeps 1 2 3 5 6 — in both cases the two it
 * drops are the semitone neighbours, which is why nothing in the shape clashes.
 */
const KEPT_DEGREE_INDEXES: Record<PentatonicFlavor, readonly number[]> = {
  minor: [0, 2, 3, 4, 6],
  major: [0, 1, 2, 4, 5],
}

/** The degree whose lowered form is the blue note: ♭5 in minor, ♭3 in major. */
const BLUE_NOTE_SOURCE: Record<PentatonicFlavor, { index: number; label: string }> = {
  minor: { index: 4, label: '♭V' },
  major: { index: 2, label: '♭III' },
}

const LABELS: Record<Lang, Record<PentatonicFlavor, { label: string; short: string; blues: string }>> = {
  ru: {
    minor: { label: 'минорная пентатоника', short: 'минорная', blues: 'минорный блюз' },
    major: { label: 'мажорная пентатоника', short: 'мажорная', blues: 'мажорный блюз' },
  },
  en: {
    minor: { label: 'minor pentatonic', short: 'minor', blues: 'minor blues' },
    major: { label: 'major pentatonic', short: 'major', blues: 'major blues' },
  },
}

export interface PentatonicScale {
  flavor: PentatonicFlavor
  /** The key the pentatonic itself sits in — the relative one when flavours are swapped. */
  selection: KeySelection
  label: string
  shortLabel: string
  tonic: SpelledNote
  /** The five notes, plus the blue note in its place when blues is on. */
  notes: ScaleNote[]
  /** Always the five, whatever `blues` says. */
  coreNotes: ScaleNote[]
  /** The two degrees of the parent scale that were dropped. */
  omitted: ScaleNote[]
  blueNote: ScaleNote | null
  /** The seven-note scale the five were taken from. */
  parent: BuiltScale
  /** The other flavour: the same five pitches counted from the relative tonic. */
  relative: KeySelection
  formula: string
}

/** The tonic that flavour sits on for a given key — its own, or its relative. */
export function pentatonicSelection(key: KeySelection, flavor: PentatonicFlavor): KeySelection {
  if (flavor === 'minor') {
    const tonic = key.mode === 'minor' ? key.tonic : getRelativeMinorPitch(key.tonic)
    return { tonic: mod(tonic), mode: 'minor', spelling: key.spelling }
  }
  const tonic = key.mode === 'major' ? key.tonic : getRelativeMajorPitch(key.tonic)
  return { tonic: mod(tonic), mode: 'major', spelling: key.spelling }
}

/** The flavour that shares the key's own tonic — minor keys get the minor one. */
export function defaultFlavor(key: KeySelection): PentatonicFlavor {
  return key.mode === 'minor' ? 'minor' : 'major'
}

/**
 * Builds a pentatonic by dropping two degrees from the parent scale instead of
 * spelling five notes from scratch: the parent already carries the right
 * letters and accidentals, and what it leaves over is exactly the pair the UI
 * greys out. The parent is always the natural scale — the harmonic and melodic
 * minors alter degrees the pentatonic does not keep anyway.
 */
export function buildPentatonic(
  key: KeySelection,
  flavor: PentatonicFlavor = defaultFlavor(key),
  options: { blues?: boolean } = {},
): PentatonicScale {
  const selection = pentatonicSelection(key, flavor)
  const parent = buildScale(selection, 'natural')
  const kept = KEPT_DEGREE_INDEXES[flavor]
  const coreNotes = parent.ascending.filter((_, index) => kept.includes(index))
  const omitted = parent.ascending.filter((_, index) => !kept.includes(index))

  const source = BLUE_NOTE_SOURCE[flavor]
  const sourceNote = parent.ascending[source.index]
  const blueNote: ScaleNote | null = sourceNote
    ? {
        ...alterNote(sourceNote, -1),
        degree: sourceNote.degree,
        interval: mod(sourceNote.interval - 1),
        degreeLabel: source.label,
      }
    : null

  const notes =
    options.blues && blueNote
      ? [...coreNotes, blueNote].sort((a, b) => a.interval - b.interval)
      : coreNotes

  const labels = LABELS[getLang()][flavor]

  return {
    flavor,
    selection,
    label: options.blues ? labels.blues : labels.label,
    shortLabel: labels.short,
    tonic: parent.tonic,
    notes,
    coreNotes,
    omitted,
    blueNote,
    parent,
    relative: pentatonicSelection(key, flavor === 'minor' ? 'major' : 'minor'),
    formula: scaleFormula(notes.map((note) => note.interval)),
  }
}

/** "A · Ля минорная пентатоника" — the task line of a practice round. */
export function pentatonicDisplayName(pentatonic: PentatonicScale): string {
  const { tonic, label } = pentatonic
  if (getLang() === 'en') return `${tonic.symbol} ${label}`
  return `${tonic.symbol} · ${tonic.solfege} ${label}`
}
