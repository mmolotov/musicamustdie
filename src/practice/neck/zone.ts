import { mod } from '../../music/theory'
import type { FretSpan, NeckCard, NeckCell, NeckZone, NotePool } from './types'

export const FRET_SPANS: readonly FretSpan[] = ['first', 'low', 'high', 'all']
export const NOTE_POOLS: readonly NotePool[] = ['natural', 'all']

const NATURAL_PITCH_CLASSES: readonly number[] = [0, 2, 4, 5, 7, 9, 11]

/** Frets a span covers on a neck of `frets` frets, both ends included. */
export function spanFrets(span: FretSpan, frets: number): { from: number; to: number } {
  if (span === 'first') return { from: 0, to: Math.min(5, frets) }
  if (span === 'low') return { from: 0, to: Math.min(12, frets) }
  if (span === 'high') return { from: Math.min(12, frets), to: frets }
  return { from: 0, to: frets }
}

function everyString(stringCount: number): number[] {
  return Array.from({ length: stringCount }, (_, stringIndex) => stringIndex)
}

export function defaultZone(stringCount: number): NeckZone {
  return { strings: everyString(stringCount), span: 'low', pool: 'natural' }
}

/**
 * Fits a saved zone to the instrument as it is configured now: a zone saved on
 * a seven-string must not ask for a string a six-string does not have, and a
 * zone with no strings left falls back to all of them.
 */
export function normalizeZone(zone: NeckZone, stringCount: number): NeckZone {
  const strings = [...new Set(zone.strings)]
    .filter((stringIndex) => stringIndex >= 0 && stringIndex < stringCount)
    .sort((a, b) => a - b)
  return { ...zone, strings: strings.length > 0 ? strings : everyString(stringCount) }
}

export function isNeckZone(value: unknown): value is NeckZone {
  if (typeof value !== 'object' || value === null) return false
  const zone = value as Record<string, unknown>
  return (
    Array.isArray(zone.strings) &&
    zone.strings.every((stringIndex) => Number.isInteger(stringIndex)) &&
    FRET_SPANS.includes(zone.span as FretSpan) &&
    NOTE_POOLS.includes(zone.pool as NotePool)
  )
}

/**
 * Every question the zone can ask: one card per note per chosen string. The
 * string is part of the question because the pitch alone is all the microphone
 * can check — the same E sits on three strings.
 */
export function zoneCards(
  openStrings: readonly number[],
  frets: number,
  zone: NeckZone,
): NeckCard[] {
  const { from, to } = spanFrets(zone.span, frets)
  const cards: NeckCard[] = []

  for (const stringIndex of normalizeZone(zone, openStrings.length).strings) {
    const open = openStrings[stringIndex]
    if (open === undefined) continue
    const byPitchClass = new Map<number, NeckCell[]>()
    for (let fret = from; fret <= to; fret += 1) {
      const midi = open + fret
      const pitchClass = mod(midi)
      if (zone.pool === 'natural' && !NATURAL_PITCH_CLASSES.includes(pitchClass)) continue
      const cells = byPitchClass.get(pitchClass) ?? []
      cells.push({ stringIndex, fret, midi })
      byPitchClass.set(pitchClass, cells)
    }
    for (const [pitchClass, answers] of byPitchClass) {
      cards.push({ stringIndex, pitchClass, answers })
    }
  }
  return cards
}
