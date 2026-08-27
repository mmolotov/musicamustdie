import { describe, expect, it } from 'vitest'
import { buildPentatonic } from '../music/pentatonic'
import { DEFAULT_BASS_CONFIG } from './bass'
import { DEFAULT_GUITAR_CONFIG, generatePentatonicBoxPatterns } from './guitar'
import type { GuitarConfig } from './guitar'

const aMinor = buildPentatonic({ tonic: 9, mode: 'minor', spelling: 'sharp' })
const cMajor = buildPentatonic({ tonic: 0, mode: 'major', spelling: 'sharp' })

function boxes(config: GuitarConfig = DEFAULT_GUITAR_CONFIG, blues = false) {
  const pentatonic = blues
    ? buildPentatonic({ tonic: 9, mode: 'minor', spelling: 'sharp' }, 'minor', { blues: true })
    : aMinor
  const extras = blues && pentatonic.blueNote ? [pentatonic.blueNote] : []
  return generatePentatonicBoxPatterns(config, pentatonic.coreNotes, extras)
}

describe('боксы пентатоники', () => {
  it('строит пять боксов, по два звука на струну', () => {
    const patterns = boxes()

    expect(patterns).toHaveLength(5)
    patterns.forEach((pattern, index) => {
      expect(pattern.name).toContain(`Бокс ${index + 1}`)
      expect(pattern.system).toBe('pentatonic')
      expect(pattern.locations).toHaveLength(DEFAULT_GUITAR_CONFIG.strings.length * 2)
      DEFAULT_GUITAR_CONFIG.strings.forEach((_, stringIndex) => {
        const onString = pattern.locations.filter((location) => location.stringIndex === stringIndex)
        expect(onString).toHaveLength(2)
      })
    })
  })

  it('держит в боксе только ноты пентатоники', () => {
    const allowed = new Set(aMinor.coreNotes.map((note) => note.pitchClass))
    boxes().forEach((pattern) => {
      pattern.locations.forEach((location) => {
        expect(allowed.has(location.pitchClass)).toBe(true)
      })
    })
  })

  it('первый бокс начинается с тоники на самой низкой струне', () => {
    const [firstBox] = boxes()
    const lowest = firstBox?.locations
      .filter((location) => location.stringIndex === 0)
      .sort((a, b) => a.fret - b.fret)[0]
    expect(lowest?.pitchClass).toBe(9)
  })

  it('боксы идут по грифу подряд и перекрываются', () => {
    const positions = boxes().map((pattern) => pattern.startPosition)
    const sorted = [...positions].sort((a, b) => a - b)
    // Пять боксов покрывают гриф без разрывов больше октавы.
    sorted.slice(1).forEach((position, index) => {
      expect(position - (sorted[index] ?? 0)).toBeLessThanOrEqual(5)
    })
  })

  it('прогон каждого бокса начинается и заканчивается на тонике', () => {
    boxes().forEach((pattern) => {
      const byId = new Map(pattern.locations.map((location) => [location.id, location]))
      const path = pattern.ascending.map((event) => byId.get(event.locationId ?? ''))
      expect(path.length).toBeGreaterThanOrEqual(6)
      expect(path[0]?.pitchClass).toBe(9)
      expect(path.at(-1)?.pitchClass).toBe(9)
      path.slice(1).forEach((location, index) => {
        expect(location?.midi ?? 0).toBeGreaterThan(path[index]?.midi ?? 0)
      })
    })
  })

  it('мажорная пентатоника даёт те же формы от своей тоники', () => {
    const majorBoxes = generatePentatonicBoxPatterns(DEFAULT_GUITAR_CONFIG, cMajor.coreNotes)
    expect(majorBoxes).toHaveLength(5)
    const majorShapes = majorBoxes.map((pattern) =>
      pattern.locations.map((location) => location.fret - pattern.startPosition).join(','),
    )
    const minorShapes = boxes().map((pattern) =>
      pattern.locations.map((location) => location.fret - pattern.startPosition).join(','),
    )
    // Те же пять фигур, только пронумерованы от другой ступени.
    expect(new Set(majorShapes)).toEqual(new Set(minorShapes))
  })

  it('добавляет блюзовую ноту внутрь бокса, не ломая форму', () => {
    const plain = boxes()
    const blues = boxes(DEFAULT_GUITAR_CONFIG, true)

    expect(blues).toHaveLength(5)
    blues.forEach((pattern, index) => {
      const plainCount = plain[index]?.locations.length ?? 0
      expect(pattern.locations.length).toBeGreaterThan(plainCount)
      const blueLocations = pattern.locations.filter((location) => location.pitchClass === 3)
      expect(blueLocations.length).toBeGreaterThan(0)
      blueLocations.forEach((location) => {
        expect(location.fret).toBeGreaterThanOrEqual(pattern.startPosition)
        expect(location.fret).toBeLessThanOrEqual(pattern.endPosition)
      })
    })
  })

  it('работает на четырёхструнном басу', () => {
    const patterns = boxes(DEFAULT_BASS_CONFIG)
    expect(patterns).toHaveLength(5)
    patterns.forEach((pattern) => {
      expect(pattern.locations).toHaveLength(DEFAULT_BASS_CONFIG.strings.length * 2)
    })
  })

  it('не строит боксы из недопентатонного набора нот', () => {
    expect(generatePentatonicBoxPatterns(DEFAULT_GUITAR_CONFIG, aMinor.coreNotes.slice(0, 4))).toEqual([])
  })
})
