import { describe, expect, it } from 'vitest'
import {
  availableSpans,
  defaultZone,
  isNeckZone,
  normalizeZone,
  spanFrets,
  zoneCards,
} from './zone'
import type { NeckZone } from './types'

const GUITAR = [40, 45, 50, 55, 59, 64]
const BASS = [28, 33, 38, 43]

const sixth = (patch: Partial<NeckZone> = {}): NeckZone => ({
  strings: [0],
  span: 'low',
  pool: 'natural',
  ...patch,
})

const frets = (zone: NeckZone, openStrings = GUITAR, neckFrets = 24) =>
  zoneCards(openStrings, neckFrets, zone).map((card) => card.answers.map((cell) => cell.fret))

describe('зона тренировки грифа', () => {
  it('натуральные ноты шестой струны в пределах двенадцати ладов', () => {
    const cards = zoneCards(GUITAR, 24, sixth())
    // E F G A B C D — по карточке на ноту.
    expect(cards.map((card) => card.pitchClass)).toEqual([4, 5, 7, 9, 11, 0, 2])
    expect(cards.every((card) => card.stringIndex === 0)).toBe(true)
    // Открытая струна и её двенадцатый лад — одна и та же нота, засчитывается любая.
    expect(frets(sixth())).toEqual([[0, 12], [1], [3], [5], [7], [8], [10]])
  })

  it('диапазоны ладов', () => {
    expect(frets(sixth({ span: 'first' }))).toEqual([[0], [1], [3], [5]])
    expect(frets(sixth({ span: 'high' }))).toEqual([[12, 24], [13], [15], [17], [19], [20], [22]])
    expect(frets(sixth({ span: 'all' }))[0]).toEqual([0, 12, 24])

    expect(spanFrets('low', 24)).toEqual({ from: 0, to: 12 })
    // Диапазон не вылезает за последний лад.
    expect(spanFrets('high', 15)).toEqual({ from: 12, to: 15 })
    expect(spanFrets('low', 12)).toEqual({ from: 0, to: 12 })
    expect(spanFrets('all', 21)).toEqual({ from: 0, to: 21 })
  })

  it('все двенадцать нот вместо семи натуральных', () => {
    const cards = zoneCards(GUITAR, 24, sixth({ pool: 'all' }))
    expect(cards).toHaveLength(12)
    expect(new Set(cards.map((card) => card.pitchClass)).size).toBe(12)
  })

  it('спрашивает только выбранные струны', () => {
    const cards = zoneCards(GUITAR, 24, sixth({ strings: [0, 1] }))
    expect(cards).toHaveLength(14)
    expect(new Set(cards.map((card) => card.stringIndex))).toEqual(new Set([0, 1]))

    const fourth = zoneCards(GUITAR, 24, sixth({ strings: [2] }))
    // Четвёртая струна — D: D E F G A B C.
    expect(fourth.map((card) => card.pitchClass)).toEqual([2, 4, 5, 7, 9, 11, 0])
  })

  it('на басу зона строится от его струн', () => {
    const cards = zoneCards(BASS, 24, defaultZone(BASS.length))
    expect(new Set(cards.map((card) => card.stringIndex))).toEqual(new Set([0, 1, 2, 3]))
    expect(cards[0]?.answers[0]?.midi).toBe(28)
  })

  it('по умолчанию — все струны, двенадцать ладов, натуральные ноты', () => {
    expect(defaultZone(6)).toEqual({ strings: [0, 1, 2, 3, 4, 5], span: 'low', pool: 'natural' })
  })

  it('подгоняет сохранённую зону под текущий инструмент', () => {
    // Зона с семиструнки на шестиструнке: седьмой струны больше нет.
    expect(normalizeZone(sixth({ strings: [6, 5, 2, 2] }), 6, 24).strings).toEqual([2, 5])
    expect(normalizeZone(sixth({ strings: [4, 5] }), 4, 24).strings).toEqual([0, 1, 2, 3])
    expect(normalizeZone(sixth({ strings: [] }), 6, 24).strings).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('на коротком грифе предлагает только те диапазоны, в которых есть смысл', () => {
    expect(availableSpans(24)).toEqual(['first', 'low', 'high', 'all'])
    // Выше двенадцатого один лад — отдельного диапазона он не стоит.
    expect(availableSpans(13)).toEqual(['first', 'low', 'all'])
    expect(availableSpans(12)).toEqual(['first', 'low'])

    expect(normalizeZone(sixth({ span: 'high' }), 6, 12).span).toBe('low')
    expect(normalizeZone(sixth({ span: 'high' }), 6, 22).span).toBe('high')
  })

  it('проверяет то, что лежит в localStorage', () => {
    expect(isNeckZone(sixth())).toBe(true)
    expect(isNeckZone({ strings: [0], span: 'low' })).toBe(false)
    expect(isNeckZone({ strings: ['0'], span: 'low', pool: 'natural' })).toBe(false)
    expect(isNeckZone({ strings: [0], span: 'middle', pool: 'natural' })).toBe(false)
    expect(isNeckZone(null)).toBe(false)
  })
})
