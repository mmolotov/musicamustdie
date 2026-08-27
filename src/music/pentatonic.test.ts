import { describe, expect, it } from 'vitest'
import { buildPentatonic, defaultFlavor, pentatonicSelection } from './pentatonic'
import type { KeySelection } from './types'

const symbols = (key: KeySelection) => buildPentatonic(key).notes.map((note) => note.symbol)

describe('пентатоника', () => {
  it('строит минорную пентатонику как гамму без двух ступеней', () => {
    const pentatonic = buildPentatonic({ tonic: 9, mode: 'minor', spelling: 'sharp' })

    expect(pentatonic.flavor).toBe('minor')
    expect(pentatonic.notes.map((note) => note.symbol)).toEqual(['A', 'C', 'D', 'E', 'G'])
    expect(pentatonic.omitted.map((note) => note.symbol)).toEqual(['B', 'F'])
    expect(pentatonic.notes.map((note) => note.interval)).toEqual([0, 3, 5, 7, 10])
    // Ступени остаются ступенями родительской гаммы: I III IV V VII.
    expect(pentatonic.notes.map((note) => note.degreeLabel)).toEqual(['I', 'III', 'IV', 'V', 'VII'])
  })

  it('строит мажорную пентатонику и её пропущенные ступени', () => {
    const pentatonic = buildPentatonic({ tonic: 0, mode: 'major', spelling: 'sharp' })

    expect(pentatonic.notes.map((note) => note.symbol)).toEqual(['C', 'D', 'E', 'G', 'A'])
    expect(pentatonic.omitted.map((note) => note.symbol)).toEqual(['F', 'B'])
    expect(pentatonic.notes.map((note) => note.interval)).toEqual([0, 2, 4, 7, 9])
  })

  it('мажорная и относительная минорная пентатоники состоят из одних и тех же нот', () => {
    const key: KeySelection = { tonic: 0, mode: 'major', spelling: 'sharp' }
    const major = buildPentatonic(key, 'major')
    const minor = buildPentatonic(key, 'minor')

    expect(minor.selection).toEqual({ tonic: 9, mode: 'minor', spelling: 'sharp' })
    expect(major.relative).toEqual(minor.selection)
    expect(minor.relative).toEqual(major.selection)
    expect(new Set(minor.notes.map((note) => note.pitchClass))).toEqual(
      new Set(major.notes.map((note) => note.pitchClass)),
    )
  })

  it('берёт натуральный минор как родителя, какой бы вариант ни был выбран', () => {
    const pentatonic = buildPentatonic({ tonic: 4, mode: 'minor', spelling: 'sharp' })
    // Гармонический минор поднял бы VII до D♯, но пентатоника берёт натуральный.
    expect(pentatonic.notes.map((note) => note.symbol)).toEqual(['E', 'G', 'A', 'B', 'D'])
  })

  it('сохраняет написание тональности с диезами и бемолями', () => {
    expect(symbols({ tonic: 6, mode: 'minor', spelling: 'sharp' })).toEqual([
      'F♯', 'A', 'B', 'C♯', 'E',
    ])
    expect(symbols({ tonic: 3, mode: 'major', spelling: 'flat' })).toEqual([
      'E♭', 'F', 'G', 'B♭', 'C',
    ])
  })

  it('добавляет блюзовую ноту как пониженную ступень, а не как энгармонику', () => {
    const minorBlues = buildPentatonic({ tonic: 9, mode: 'minor', spelling: 'sharp' }, 'minor', {
      blues: true,
    })
    expect(minorBlues.notes.map((note) => note.symbol)).toEqual(['A', 'C', 'D', 'E♭', 'E', 'G'])
    expect(minorBlues.blueNote?.degreeLabel).toBe('♭V')
    expect(minorBlues.blueNote?.interval).toBe(6)

    const majorBlues = buildPentatonic({ tonic: 0, mode: 'major', spelling: 'sharp' }, 'major', {
      blues: true,
    })
    expect(majorBlues.notes.map((note) => note.symbol)).toEqual(['C', 'D', 'E♭', 'E', 'G', 'A'])
    expect(majorBlues.blueNote?.degreeLabel).toBe('♭III')

    // Пониженная квинта B♭ минора — это F♭, а не E: буква остаётся буквой квинты.
    const flatBlues = buildPentatonic({ tonic: 10, mode: 'minor', spelling: 'flat' }, 'minor', {
      blues: true,
    })
    expect(flatBlues.blueNote?.symbol).toBe('F♭')
  })

  it('не трогает состав из пяти нот, когда блюзовая нота выключена', () => {
    const pentatonic = buildPentatonic({ tonic: 9, mode: 'minor', spelling: 'sharp' }, 'minor', {
      blues: true,
    })
    expect(pentatonic.coreNotes).toHaveLength(5)
    expect(pentatonic.notes).toHaveLength(6)
  })

  it('во всех 24 тональностях даёт пять разных нот с разными буквами', () => {
    for (let tonic = 0; tonic < 12; tonic += 1) {
      for (const mode of ['major', 'minor'] as const) {
        for (const spelling of ['sharp', 'flat'] as const) {
          const pentatonic = buildPentatonic({ tonic, mode, spelling })
          const pitches = pentatonic.notes.map((note) => note.pitchClass)
          const letters = pentatonic.notes.map((note) => note.letter)
          expect(new Set(pitches).size).toBe(5)
          expect(new Set(letters).size).toBe(5)
          expect(pentatonic.omitted).toHaveLength(2)
          expect(pentatonic.notes[0]?.pitchClass).toBe(pentatonic.selection.tonic)
        }
      }
    }
  })

  it('по умолчанию выбирает пентатонику той же ладовой окраски, что и тональность', () => {
    expect(defaultFlavor({ tonic: 0, mode: 'major', spelling: 'sharp' })).toBe('major')
    expect(defaultFlavor({ tonic: 9, mode: 'minor', spelling: 'sharp' })).toBe('minor')
    expect(pentatonicSelection({ tonic: 9, mode: 'minor', spelling: 'sharp' }, 'major')).toEqual({
      tonic: 0,
      mode: 'major',
      spelling: 'sharp',
    })
  })
})
