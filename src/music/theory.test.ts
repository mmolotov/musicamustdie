import { describe, expect, it } from 'vitest'
import {
  buildScale,
  getKeySignature,
  harmonizeScale,
  notesForDirection,
} from './theory'

describe('музыкальное ядро', () => {
  it('строит и подписывает гамму C major', () => {
    const scale = buildScale({ tonic: 0, mode: 'major', spelling: 'sharp' })
    expect(scale.ascending.map((note) => note.symbol)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
    expect(scale.ascending.map((note) => note.solfege)).toEqual(['До', 'Ре', 'Ми', 'Фа', 'Соль', 'Ля', 'Си'])
    expect(getKeySignature(scale.selection)).toEqual({
      count: 0,
      accidental: 'natural',
      label: 'без знаков',
    })
  })

  it('сохраняет разные написания энгармонической тональности', () => {
    const sharp = buildScale({ tonic: 6, mode: 'major', spelling: 'sharp' })
    const flat = buildScale({ tonic: 6, mode: 'major', spelling: 'flat' })

    expect(sharp.ascending.map((note) => note.symbol)).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯'])
    expect(flat.ascending.map((note) => note.symbol)).toEqual(['G♭', 'A♭', 'B♭', 'C♭', 'D♭', 'E♭', 'F'])
  })

  it('корректно использует дубль-диез в A sharp harmonic minor', () => {
    const scale = buildScale({ tonic: 10, mode: 'minor', spelling: 'sharp' }, 'harmonic')
    expect(scale.ascending.map((note) => note.symbol)).toEqual(['A♯', 'B♯', 'C♯', 'D♯', 'E♯', 'F♯', 'G𝄪'])
  })

  it('различает направления классического мелодического минора', () => {
    const scale = buildScale({ tonic: 9, mode: 'minor', spelling: 'sharp' }, 'melodic-classical')
    expect(notesForDirection(scale, 'ascending').map((note) => note.symbol)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F♯', 'G♯',
    ])
    expect(notesForDirection(scale, 'descending').map((note) => note.symbol)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F', 'G',
    ])
  })

  it('гармонизует мажор в трезвучия и септаккорды', () => {
    const scale = buildScale({ tonic: 0, mode: 'major', spelling: 'sharp' })
    const harmony = harmonizeScale(scale.ascending)

    expect(harmony.map((degree) => degree.triad.symbol)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'])
    expect(harmony.map((degree) => degree.seventh.symbol)).toEqual([
      'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7♭5',
    ])
  })
})
