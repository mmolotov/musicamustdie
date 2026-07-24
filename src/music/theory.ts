import type {
  AccidentalPreference,
  BuiltScale,
  ChordDefinition,
  ChordQuality,
  ChordSize,
  HarmonizedDegree,
  KeySelection,
  KeySignature,
  LetterName,
  MinorVariant,
  Mode,
  ScaleDirection,
  ScaleNote,
  SpelledNote,
} from './types'

export const CIRCLE_MAJOR_PITCHES = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] as const

export const DEGREE_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const

const LETTERS: LetterName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const NATURAL_PITCHES: Record<LetterName, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}
const SOLFEGE: Record<LetterName, string> = {
  C: 'До',
  D: 'Ре',
  E: 'Ми',
  F: 'Фа',
  G: 'Соль',
  A: 'Ля',
  B: 'Си',
}

interface TonicSpec {
  letter: LetterName
  accidental: number
}

const MAJOR_TONICS: Record<number, { sharp: TonicSpec; flat: TonicSpec }> = {
  0: { sharp: { letter: 'C', accidental: 0 }, flat: { letter: 'C', accidental: 0 } },
  1: { sharp: { letter: 'C', accidental: 1 }, flat: { letter: 'D', accidental: -1 } },
  2: { sharp: { letter: 'D', accidental: 0 }, flat: { letter: 'D', accidental: 0 } },
  3: { sharp: { letter: 'E', accidental: -1 }, flat: { letter: 'E', accidental: -1 } },
  4: { sharp: { letter: 'E', accidental: 0 }, flat: { letter: 'E', accidental: 0 } },
  5: { sharp: { letter: 'F', accidental: 0 }, flat: { letter: 'F', accidental: 0 } },
  6: { sharp: { letter: 'F', accidental: 1 }, flat: { letter: 'G', accidental: -1 } },
  7: { sharp: { letter: 'G', accidental: 0 }, flat: { letter: 'G', accidental: 0 } },
  8: { sharp: { letter: 'A', accidental: -1 }, flat: { letter: 'A', accidental: -1 } },
  9: { sharp: { letter: 'A', accidental: 0 }, flat: { letter: 'A', accidental: 0 } },
  10: { sharp: { letter: 'B', accidental: -1 }, flat: { letter: 'B', accidental: -1 } },
  11: { sharp: { letter: 'B', accidental: 0 }, flat: { letter: 'C', accidental: -1 } },
}

const MINOR_TONICS: Record<number, { sharp: TonicSpec; flat: TonicSpec }> = {
  0: { sharp: { letter: 'C', accidental: 0 }, flat: { letter: 'C', accidental: 0 } },
  1: { sharp: { letter: 'C', accidental: 1 }, flat: { letter: 'C', accidental: 1 } },
  2: { sharp: { letter: 'D', accidental: 0 }, flat: { letter: 'D', accidental: 0 } },
  3: { sharp: { letter: 'D', accidental: 1 }, flat: { letter: 'E', accidental: -1 } },
  4: { sharp: { letter: 'E', accidental: 0 }, flat: { letter: 'E', accidental: 0 } },
  5: { sharp: { letter: 'F', accidental: 0 }, flat: { letter: 'F', accidental: 0 } },
  6: { sharp: { letter: 'F', accidental: 1 }, flat: { letter: 'F', accidental: 1 } },
  7: { sharp: { letter: 'G', accidental: 0 }, flat: { letter: 'G', accidental: 0 } },
  8: { sharp: { letter: 'G', accidental: 1 }, flat: { letter: 'A', accidental: -1 } },
  9: { sharp: { letter: 'A', accidental: 0 }, flat: { letter: 'A', accidental: 0 } },
  10: { sharp: { letter: 'A', accidental: 1 }, flat: { letter: 'B', accidental: -1 } },
  11: { sharp: { letter: 'B', accidental: 0 }, flat: { letter: 'B', accidental: 0 } },
}

const SCALE_INTERVALS: Record<'major' | MinorVariant, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  'melodic-classical': [0, 2, 3, 5, 7, 9, 11],
  'melodic-jazz': [0, 2, 3, 5, 7, 9, 11],
}

const SCALE_LABELS: Record<'major' | MinorVariant, { label: string; short: string }> = {
  major: { label: 'мажор', short: 'мажор' },
  natural: { label: 'натуральный минор', short: 'нат. минор' },
  harmonic: { label: 'гармонический минор', short: 'гарм. минор' },
  'melodic-classical': { label: 'классический мелодический минор', short: 'класс. мел. минор' },
  'melodic-jazz': { label: 'джазовый мелодический минор', short: 'джаз. мел. минор' },
}

const QUALITY_LABELS: Record<ChordQuality, string> = {
  major: 'мажорное трезвучие',
  minor: 'минорное трезвучие',
  diminished: 'уменьшённое трезвучие',
  augmented: 'увеличенное трезвучие',
  'major-seventh': 'большой мажорный септаккорд',
  'dominant-seventh': 'доминантсептаккорд',
  'minor-seventh': 'малый минорный септаккорд',
  'half-diminished-seventh': 'полууменьшённый септаккорд',
  'diminished-seventh': 'уменьшённый септаккорд',
  'minor-major-seventh': 'минорный септаккорд с большой септимой',
  'augmented-major-seventh': 'увеличенный септаккорд с большой септимой',
  other: 'аккорд',
}

export function mod(value: number, modulus = 12): number {
  return ((value % modulus) + modulus) % modulus
}

export function accidentalGlyph(accidental: number): string {
  if (accidental === -2) return '𝄫'
  if (accidental === -1) return '♭'
  if (accidental === 1) return '♯'
  if (accidental === 2) return '𝄪'
  return ''
}

function accidentalWord(accidental: number): string {
  if (accidental === -2) return ' дубль-бемоль'
  if (accidental === -1) return ' бемоль'
  if (accidental === 1) return ' диез'
  if (accidental === 2) return ' дубль-диез'
  return ''
}

function tonicSpec(selection: KeySelection): TonicSpec {
  const map = selection.mode === 'major' ? MAJOR_TONICS : MINOR_TONICS
  const choices = map[mod(selection.tonic)]
  if (!choices) return { letter: 'C', accidental: 0 }
  return choices[selection.spelling]
}

function toSpelledNote(spec: TonicSpec, pitchClass?: number): SpelledNote {
  const resolvedPitch = pitchClass ?? mod(NATURAL_PITCHES[spec.letter] + spec.accidental)
  const glyph = accidentalGlyph(spec.accidental)
  return {
    ...spec,
    pitchClass: resolvedPitch,
    symbol: `${spec.letter}${glyph}`,
    solfege: `${SOLFEGE[spec.letter]}${glyph}`,
    accessibleName: `${SOLFEGE[spec.letter]}${accidentalWord(spec.accidental)}`,
  }
}

export function getTonicNote(selection: KeySelection): SpelledNote {
  return toSpelledNote(tonicSpec(selection), mod(selection.tonic))
}

function closestAccidental(targetPitch: number, letter: LetterName): number {
  let delta = mod(targetPitch - NATURAL_PITCHES[letter])
  if (delta > 6) delta -= 12
  return delta
}

export function spellScale(selection: KeySelection, intervals: number[]): ScaleNote[] {
  const tonic = tonicSpec(selection)
  const tonicLetterIndex = LETTERS.indexOf(tonic.letter)

  return intervals.map((interval, index) => {
    const letter = LETTERS[(tonicLetterIndex + index) % LETTERS.length] ?? 'C'
    const pitchClass = mod(selection.tonic + interval)
    const accidental = closestAccidental(pitchClass, letter)
    return {
      ...toSpelledNote({ letter, accidental }, pitchClass),
      degree: index + 1,
      interval,
      degreeLabel: DEGREE_LABELS[index] ?? String(index + 1),
    }
  })
}

function formulaFor(intervals: number[]): string {
  return intervals
    .slice(1)
    .map((interval, index) => interval - (intervals[index] ?? 0))
    .concat(12 - (intervals.at(-1) ?? 0))
    .map((step) => (step === 2 ? 'тон' : step === 1 ? 'полутон' : `${step} пт.`))
    .join(' · ')
}

export function buildScale(
  selection: KeySelection,
  minorVariant: MinorVariant = 'natural',
): BuiltScale {
  const id = selection.mode === 'major' ? 'major' : minorVariant
  const ascendingIntervals = SCALE_INTERVALS[id]
  const descendingIntervals =
    id === 'melodic-classical' ? SCALE_INTERVALS.natural : ascendingIntervals
  const label = SCALE_LABELS[id]

  return {
    id,
    label: label.label,
    shortLabel: label.short,
    selection,
    tonic: getTonicNote(selection),
    ascending: spellScale(selection, ascendingIntervals),
    descending: spellScale(selection, descendingIntervals),
    formula: formulaFor(ascendingIntervals),
  }
}

export function notesForDirection(scale: BuiltScale, direction: ScaleDirection): ScaleNote[] {
  return direction === 'ascending' ? scale.ascending : scale.descending
}

function intervalsFromRoot(notes: ScaleNote[]): number[] {
  const root = notes[0]?.pitchClass ?? 0
  return notes.map((note) => mod(note.pitchClass - root))
}

function chordQuality(notes: ScaleNote[]): ChordQuality {
  const signature = intervalsFromRoot(notes).join(',')
  const lookup: Record<string, ChordQuality> = {
    '0,4,7': 'major',
    '0,3,7': 'minor',
    '0,3,6': 'diminished',
    '0,4,8': 'augmented',
    '0,4,7,11': 'major-seventh',
    '0,4,7,10': 'dominant-seventh',
    '0,3,7,10': 'minor-seventh',
    '0,3,6,10': 'half-diminished-seventh',
    '0,3,6,9': 'diminished-seventh',
    '0,3,7,11': 'minor-major-seventh',
    '0,4,8,11': 'augmented-major-seventh',
  }
  return lookup[signature] ?? 'other'
}

function qualitySuffix(quality: ChordQuality): string {
  const suffixes: Record<ChordQuality, string> = {
    major: '',
    minor: 'm',
    diminished: 'dim',
    augmented: 'aug',
    'major-seventh': 'maj7',
    'dominant-seventh': '7',
    'minor-seventh': 'm7',
    'half-diminished-seventh': 'm7♭5',
    'diminished-seventh': 'dim7',
    'minor-major-seventh': 'm(maj7)',
    'augmented-major-seventh': 'aug(maj7)',
    other: '',
  }
  return suffixes[quality]
}

function romanFor(degree: number, quality: ChordQuality, size: ChordSize): string {
  const bases = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  const base = bases[degree - 1] ?? String(degree)
  const isMinor = quality === 'minor' || quality === 'minor-seventh' || quality === 'minor-major-seventh'
  const isDiminished =
    quality === 'diminished' ||
    quality === 'diminished-seventh' ||
    quality === 'half-diminished-seventh'
  const numeral = isMinor || isDiminished ? base.toLowerCase() : base
  const diminishedMark = quality === 'half-diminished-seventh' ? 'ø' : isDiminished ? '°' : ''
  const augmentedMark = quality === 'augmented' || quality === 'augmented-major-seventh' ? '+' : ''
  return `${numeral}${diminishedMark}${augmentedMark}${size === 'seventh' ? '7' : ''}`
}

function requiredTones(notes: ScaleNote[], quality: ChordQuality): number[] {
  if (notes.length === 3) return notes.map((note) => note.pitchClass)
  const root = notes[0]?.pitchClass ?? 0
  return notes
    .filter((note) => {
      const interval = mod(note.pitchClass - root)
      return interval !== 7 || quality === 'half-diminished-seventh' || quality === 'diminished-seventh'
    })
    .map((note) => note.pitchClass)
}

function makeChord(scaleNotes: ScaleNote[], degreeIndex: number, size: ChordSize): ChordDefinition {
  const noteCount = size === 'triad' ? 3 : 4
  const notes = Array.from({ length: noteCount }, (_, stackIndex) => {
    const index = (degreeIndex + stackIndex * 2) % scaleNotes.length
    return scaleNotes[index] ?? scaleNotes[0]
  }).filter((note): note is ScaleNote => Boolean(note))
  const quality = chordQuality(notes)
  const root = notes[0] ?? scaleNotes[0]
  if (!root) throw new Error('Нельзя построить аккорд из пустой гаммы')

  return {
    degree: degreeIndex + 1,
    size,
    root,
    notes,
    pitchClasses: notes.map((note) => note.pitchClass),
    requiredPitchClasses: requiredTones(notes, quality),
    quality,
    qualityLabel: QUALITY_LABELS[quality],
    symbol: `${root.symbol}${qualitySuffix(quality)}`,
    roman: romanFor(degreeIndex + 1, quality, size),
  }
}

export function harmonizeScale(scaleNotes: ScaleNote[]): HarmonizedDegree[] {
  return scaleNotes.map((_, index) => ({
    degree: index + 1,
    triad: makeChord(scaleNotes, index, 'triad'),
    seventh: makeChord(scaleNotes, index, 'seventh'),
  }))
}

export function getRelativeMinorPitch(majorPitch: number): number {
  return mod(majorPitch + 9)
}

export function getRelativeMajorPitch(minorPitch: number): number {
  return mod(minorPitch + 3)
}

export function defaultSpellingForMajorPitch(pitch: number): AccidentalPreference {
  if (mod(pitch) === 1 || mod(pitch) === 8 || mod(pitch) === 3 || mod(pitch) === 10 || mod(pitch) === 5) {
    return 'flat'
  }
  return 'sharp'
}

export function circleTonicLabel(
  pitch: number,
  mode: Mode,
  spelling: AccidentalPreference,
): string {
  return getTonicNote({ tonic: pitch, mode, spelling }).symbol
}

export function keyDisplayName(selection: KeySelection): string {
  const tonic = getTonicNote(selection)
  const modeLabel = selection.mode === 'major' ? 'мажор' : 'минор'
  return `${tonic.symbol} · ${tonic.solfege} ${modeLabel}`
}

export function getKeySignature(selection: KeySelection): KeySignature {
  const baseScale = buildScale(selection, 'natural')
  const notes = selection.mode === 'major' ? baseScale.ascending : baseScale.descending
  const sharps = notes.reduce((sum, note) => sum + Math.max(0, note.accidental), 0)
  const flats = notes.reduce((sum, note) => sum + Math.max(0, -note.accidental), 0)

  const pluralize = (count: number, one: string, few: string, many: string) => {
    if (count % 10 === 1 && count % 100 !== 11) return one
    if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return few
    return many
  }

  if (sharps > 0) {
    return {
      count: sharps,
      accidental: 'sharp',
      label: `${sharps} ${pluralize(sharps, 'диез', 'диеза', 'диезов')}`,
    }
  }
  if (flats > 0) {
    return {
      count: flats,
      accidental: 'flat',
      label: `${flats} ${pluralize(flats, 'бемоль', 'бемоля', 'бемолей')}`,
    }
  }
  return { count: 0, accidental: 'natural', label: 'без знаков' }
}

export function formatPitchClass(pitchClass: number, preference: AccidentalPreference): string {
  const sharpNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  const flatNames = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
  return (preference === 'sharp' ? sharpNames : flatNames)[mod(pitchClass)] ?? 'C'
}
