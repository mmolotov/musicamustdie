import { describe, expect, it } from 'vitest'
import { buildScale, defaultSpellingForMajorPitch, harmonizeScale } from '../music/theory'
import {
  DEFAULT_GUITAR_CONFIG,
  DEFAULT_GUITAR_PREFERENCES,
  DEFAULT_VOICING_CONSTRAINTS,
  findTonicToTonicPath,
  generateCuratedCagedPatterns,
  generateCuratedThreeNpsPatterns,
  generateExtendedScalePatterns,
  generateGuitarPatterns,
  generateOneOctavePatterns,
  generatePositionalPatterns,
  generateTwoOctaveHybridPatterns,
  generateVoicings,
  groupScalePatternsForDisplay,
  hasCagedTopology,
  isGuitarConfig,
  isGuitarPreferences,
  locateScaleOnFretboard,
  rankScalePatterns,
  scalePatternConstructionKey,
  scaleGenerationOptions,
  standardSixStringOffset,
} from './guitar'
import type { FretLocation, PatternRoute, PerformancePattern } from './types'

const cMajor = buildScale({ tonic: 0, mode: 'major', spelling: 'sharp' })

function expectRouteIntegrity(
  pattern: PerformancePattern<FretLocation>,
  route: PatternRoute,
  tonicPitchClass: number,
  scaleLength = 7,
) {
  const locationsById = new Map(pattern.locations.map((location) => [location.id, location]))
  route.ascending.forEach((event, index) => {
    const location = locationsById.get(event.locationId ?? '')
    expect(location, `${pattern.id}/${route.id}: location ${event.locationId}`).toBeDefined()
    expect(event.midi).toBe(location?.midi)
    expect(event.startBeat).toBe(index * 0.5)
    expect(event.finger).toBe(location?.finger)
    if (index === 0) expect(event.positionShift).not.toBe(true)
  })
  expect(route.descending.map((event) => event.locationId)).toEqual(
    route.ascending.map((event) => event.locationId).reverse(),
  )
  expect(route.descending.map((event) => event.midi)).toEqual(
    route.ascending.map((event) => event.midi).reverse(),
  )

  const octaveMatch = /^tonic-(\d)oct$/.exec(route.kind)
  if (!octaveMatch) return
  const octaves = Number(octaveMatch[1])
  expect(route.ascending).toHaveLength(octaves * scaleLength + 1)
  expect(route.ascending.every((event, index, events) =>
    index === 0 || event.midi > (events[index - 1]?.midi ?? -Infinity),
  )).toBe(true)
  const tonicIndexes = route.ascending.flatMap((event, index) => {
    const location = locationsById.get(event.locationId ?? '')
    return location?.pitchClass === tonicPitchClass ? [index] : []
  })
  expect(tonicIndexes).toEqual(Array.from({ length: octaves + 1 }, (_, index) => index * scaleLength))
  expect((route.ascending.at(-1)?.midi ?? 0) - (route.ascending[0]?.midi ?? 0)).toBe(octaves * 12)
}

function expectPatternIntegrity(pattern: PerformancePattern<FretLocation>, tonicPitchClass: number) {
  const routes = pattern.routes ?? []
  expect(routes.length).toBeGreaterThan(0)
  expect(new Set(routes.map((route) => route.id)).size).toBe(routes.length)
  const defaultRoute = routes.find((route) => route.id === pattern.defaultRouteId)
  expect(defaultRoute).toBeDefined()
  expect(pattern.ascending).toEqual(defaultRoute?.ascending)
  expect(pattern.descending).toEqual(defaultRoute?.descending)
  expect(pattern.startPosition).toBe(Math.min(...pattern.locations.map((location) => location.fret)))
  expect(pattern.endPosition).toBe(Math.max(...pattern.locations.map((location) => location.fret)))
  expect(pattern.ergonomics?.fretSpan).toBe(pattern.endPosition - pattern.startPosition)
  expect(pattern.ergonomics?.difficulty).toBeGreaterThanOrEqual(1)
  expect(pattern.ergonomics?.difficulty).toBeLessThanOrEqual(5)
  pattern.locations.forEach((location) => {
    if (location.fret === 0) expect(location.finger).toBeUndefined()
    else expect([1, 2, 3, 4]).toContain(location.finger)
  })
  routes.forEach((route) => expectRouteIntegrity(pattern, route, tonicPitchClass))
}

describe('модуль электрогитары', () => {
  it('проверяет конфигурацию и находит стандартный шестиструнный блок', () => {
    expect(isGuitarConfig(DEFAULT_GUITAR_CONFIG)).toBe(true)
    expect(standardSixStringOffset(DEFAULT_GUITAR_CONFIG)).toBe(0)
    expect(hasCagedTopology(DEFAULT_GUITAR_CONFIG)).toBe(true)
    const seven = { ...DEFAULT_GUITAR_CONFIG, strings: [35, 40, 45, 50, 55, 59, 64] }
    const eight = { ...DEFAULT_GUITAR_CONFIG, strings: [30, 35, 40, 45, 50, 55, 59, 64] }
    expect(standardSixStringOffset(seven)).toBe(1)
    expect(standardSixStringOffset(eight)).toBe(2)
    expect(hasCagedTopology(seven)).toBe(true)
    expect(hasCagedTopology(eight)).toBe(true)
    expect(hasCagedTopology({ ...DEFAULT_GUITAR_CONFIG, strings: [38, 45, 50, 55, 59, 64] })).toBe(false)
  })

  it('находит корневые C на стандартном грифе', () => {
    const locations = locateScaleOnFretboard(DEFAULT_GUITAR_CONFIG, cMajor.ascending)
    expect(locations).toContainEqual(expect.objectContaining({ stringIndex: 0, fret: 8, pitchClass: 0, degree: 1 }))
    expect(locations).toContainEqual(expect.objectContaining({ stringIndex: 1, fret: 3, pitchClass: 0, degree: 1 }))
    expect(locations.every((location) => cMajor.ascending.some((note) => note.pitchClass === location.pitchClass))).toBe(true)
  })

  it('предпочитает две октавы и сокращает маршрут, только когда диапазона не хватает', () => {
    const locations = locateScaleOnFretboard(DEFAULT_GUITAR_CONFIG, cMajor.ascending)
    const twoOctaveRoute = findTonicToTonicPath(locations, cMajor.ascending)
    const oneOctaveLocations = locations.filter((location) => location.midi >= 48 && location.midi <= 60)
    const oneOctaveRoute = findTonicToTonicPath(oneOctaveLocations, cMajor.ascending)

    expect(twoOctaveRoute).toHaveLength(15)
    expect(twoOctaveRoute.filter((location) => location.pitchClass === 0).map((location) => location.midi)).toEqual([48, 60, 72])
    expect(oneOctaveRoute).toHaveLength(8)
  })

  it('реализует пять точных CAGED-карт, включая эталонную открытую C-форму', () => {
    const patterns = generateCuratedCagedPatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending)
    expect(patterns.map((pattern) => pattern.name)).toEqual([
      'Форма C', 'Форма A', 'Форма G', 'Форма E', 'Форма D',
    ])
    expect(patterns).toHaveLength(5)
    const cShape = patterns[0]
    expect(DEFAULT_GUITAR_CONFIG.strings.map((_, stringIndex) =>
      cShape?.locations
        .filter((location) => location.stringIndex === stringIndex)
        .map((location) => location.fret),
    )).toEqual([
      [0, 1, 3],
      [0, 2, 3],
      [0, 2, 3],
      [0, 2],
      [0, 1, 3],
      [0, 1, 3],
    ])
    patterns.forEach((pattern) => expectPatternIntegrity(pattern, 0))
  })

  it('строит семь точных позиционных форм Berklee-style', () => {
    const patterns = generatePositionalPatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending)
    expect(patterns).toHaveLength(7)
    expect(patterns.every((pattern) => pattern.system === 'position')).toBe(true)
    expect(patterns.some((pattern) => pattern.locations.length === 18)).toBe(true)
    patterns.forEach((pattern) => expectPatternIntegrity(pattern, 0))
  })

  it('строит семь последовательных 3NPS-форм с тремя нотами на струне', () => {
    const patterns = generateCuratedThreeNpsPatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending)
    const firstPattern = patterns[0]
    expect(patterns).toHaveLength(7)
    expect(firstPattern?.name).toBe('3NPS 1 · C')
    expect(DEFAULT_GUITAR_CONFIG.strings.map((_, stringIndex) =>
      firstPattern?.locations
        .filter((location) => location.stringIndex === stringIndex)
        .map((location) => location.fret),
    )).toEqual([
      [8, 10, 12],
      [8, 10, 12],
      [9, 10, 12],
      [9, 10, 12],
      [10, 12, 13],
      [10, 12, 13],
    ])
    patterns.forEach((pattern) => {
      DEFAULT_GUITAR_CONFIG.strings.forEach((_, stringIndex) => {
        expect(pattern.locations.filter((location) => location.stringIndex === stringIndex)).toHaveLength(3)
      })
      expectPatternIntegrity(pattern, 0)
    })

  })

  it('даёт по две однооктавные геометрии от четырёх корневых струн', () => {
    const patterns = generateOneOctavePatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending)
    expect(patterns).toHaveLength(8)
    patterns.forEach((pattern) => {
      expect(pattern.system).toBe('one-octave')
      expect(pattern.locations).toHaveLength(8)
      expect(pattern.routes?.map((route) => route.kind)).toEqual(['tonic-1oct'])
      expectPatternIntegrity(pattern, 0)
    })
  })

  it('добавляет двухоктавные гибриды 2+3+3+3+4 и 1+3+3+3+3+2', () => {
    const patterns = generateTwoOctaveHybridPatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending)
    expect(patterns).toHaveLength(3)
    expect(patterns.map((pattern) => pattern.sourceId)).toEqual([
      'two-octave-two-three-three-three-four-root-6',
      'two-octave-two-three-three-three-four-root-5',
      'two-octave-one-three-three-three-three-two-root-6',
    ])

    patterns.forEach((pattern) => {
      const route = pattern.routes?.find((candidate) => candidate.kind === 'tonic-2oct')
      expect(route).toBeDefined()
      expect(route?.ascending).toHaveLength(15)
      const locationsById = new Map(pattern.locations.map((location) => [location.id, location]))
      const counts = new Map<number, number>()
      route?.ascending.forEach((event) => {
        const stringIndex = locationsById.get(event.locationId ?? '')?.stringIndex
        if (stringIndex !== undefined) counts.set(stringIndex, (counts.get(stringIndex) ?? 0) + 1)
      })
      const actualPerString = [...counts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, count]) => count)
      if (pattern.sourceId?.includes('two-three-three-three-four')) {
        expect(actualPerString).toEqual([2, 3, 3, 3, 4])
      } else {
        expect(actualPerString).toEqual([1, 3, 3, 3, 3, 2])
      }
      expectPatternIntegrity(pattern, 0)
    })

    const sixStringLayouts = patterns
      .filter((pattern) => pattern.sourceId?.endsWith('root-6'))
      .map((pattern) => DEFAULT_GUITAR_CONFIG.strings.map((_, stringIndex) =>
        pattern.locations
          .filter((location) => location.stringIndex === stringIndex)
          .map((location) => location.fret),
      ))
    expect(sixStringLayouts).toContainEqual([
      [8, 10], [7, 8, 10], [7, 9, 10], [7, 9, 10], [8, 10, 12, 13], [],
    ])
    expect(sixStringLayouts).toContainEqual([
      [8], [5, 7, 8], [5, 7, 9], [5, 7, 9], [6, 8, 10], [7, 8],
    ])
    const rootFiveLayout = patterns
      .find((pattern) => pattern.sourceId === 'two-octave-two-three-three-three-four-root-5')
    expect(DEFAULT_GUITAR_CONFIG.strings.map((_, stringIndex) =>
      rootFiveLayout?.locations
        .filter((location) => location.stringIndex === stringIndex)
        .map((location) => location.fret),
    )).toEqual([
      [], [3, 5], [2, 3, 5], [2, 4, 5], [3, 5, 6], [3, 5, 7, 8],
    ])
  })

  it('подбирает пальцы для четырёхнотного участка под профиль руки', () => {
    const profiles = [
      {
        options: { reachProfile: 'compact', playerLevel: 'intermediate', handSize: 'small' },
        fingers: [1, 1, 2, 4],
      },
      {
        options: { reachProfile: 'balanced', playerLevel: 'intermediate', handSize: 'medium' },
        fingers: [1, 2, 4, 4],
      },
      {
        options: { reachProfile: 'stretch', playerLevel: 'advanced', handSize: 'large' },
        fingers: [1, 2, 3, 4],
      },
    ] as const

    profiles.forEach(({ options, fingers }) => {
      const pattern = generateTwoOctaveHybridPatterns(
        DEFAULT_GUITAR_CONFIG,
        cMajor.ascending,
        options,
      ).find((candidate) => candidate.sourceId === 'two-octave-two-three-three-three-four-root-6')
      expect(pattern).toBeDefined()
      if (!pattern) throw new Error('Не найдена форма 2 + 3 + 3 + 3 + 4 от шестой струны')
      expect(pattern.locations
        .filter((location) => location.stringIndex === 4)
        .sort((a, b) => a.fret - b.fret)
        .map((location) => location.finger))
        .toEqual(fingers)
      expectPatternIntegrity(pattern, 0)
    })

    const balanced = generateTwoOctaveHybridPatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending)
    const fiveString = balanced.find((pattern) =>
      pattern.sourceId === 'two-octave-two-three-three-three-four-root-6')
    const sixString = balanced.find((pattern) =>
      pattern.sourceId === 'two-octave-one-three-three-three-three-two-root-6')
    expect(fiveString?.locations
      .filter((location) => location.stringIndex === 0)
      .map((location) => location.finger))
      .toEqual([2, 4])
    expect(fiveString?.ergonomics?.stretch).toBe('medium')
    expect(fiveString?.ergonomics?.difficulty).toBeLessThanOrEqual(3)
    expect(sixString?.locations.find((location) => location.id === 's0-f8')?.finger).toBe(4)
    const sixStringRoute = sixString?.routes?.find((route) => route.kind === 'tonic-2oct')
    expect(sixStringRoute?.ascending.slice(0, 2).map((event) => event.positionShift ?? false))
      .toEqual([false, false])
    const fiveStringRoute = fiveString?.routes?.find((route) => route.kind === 'tonic-2oct')
    expect(fiveStringRoute?.ascending
      .find((event) => event.locationId === 's4-f12')?.shiftBefore?.technique)
      .toBe('reposition')
    expect(fiveStringRoute?.ascending
      .find((event) => event.locationId === 's4-f13')?.shiftBefore?.technique)
      .toBe('slide')
  })

  it('добавляет расширенные маршруты вплоть до трёх октав', () => {
    const patterns = generateExtendedScalePatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending)
    expect(patterns.length).toBeGreaterThanOrEqual(1)
    expect(patterns.some((pattern) =>
      pattern.routes?.some((route) => route.kind === 'tonic-3oct'),
    )).toBe(true)
    expect(patterns.some((pattern) =>
      pattern.routes?.some((route) => route.ascending.some((event) => event.positionShift)),
    )).toBe(true)
    patterns.forEach((pattern) => expectPatternIntegrity(pattern, 0))
  })

  it('объединяет шесть семейств и формирует виртуальную подборку рекомендаций', () => {
    const patterns = generateGuitarPatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending, 'ascending')
    expect(patterns.filter((pattern) => pattern.system === 'caged')).toHaveLength(5)
    expect(patterns.filter((pattern) => pattern.system === 'position')).toHaveLength(7)
    expect(patterns.filter((pattern) => pattern.system === '3nps')).toHaveLength(7)
    expect(patterns.filter((pattern) => pattern.system === 'one-octave')).toHaveLength(8)
    expect(patterns.filter((pattern) => pattern.system === 'two-octave')).toHaveLength(3)
    expect(patterns.filter((pattern) => pattern.system === 'extended').length).toBeGreaterThanOrEqual(1)
    const recommended = patterns.filter((pattern) => pattern.recommended)
    expect(recommended.length).toBeGreaterThanOrEqual(7)
    expect(recommended.filter((pattern) => pattern.system === 'two-octave')).toHaveLength(2)
    expect(new Set(patterns.map((pattern) => pattern.id)).size).toBe(patterns.length)
    patterns.forEach((pattern) => expectPatternIntegrity(pattern, 0))
  })

  it('схлопывает одинаковые построения внутри вкладки независимо от названия', () => {
    const patterns = generateGuitarPatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending, 'ascending')
    const cagedE = patterns.find((pattern) => pattern.sourceId === 'caged-e')
    const positionFour = patterns.find((pattern) => pattern.sourceId === 'position-p4')
    expect(cagedE).toBeDefined()
    expect(positionFour).toBeDefined()
    if (!cagedE || !positionFour) throw new Error('Не найдены эталонные совпадающие формы')

    expect(cagedE.name).not.toBe(positionFour.name)
    expect(scalePatternConstructionKey(cagedE)).toBe(scalePatternConstructionKey(positionFour))
    const rankedDuplicates = rankScalePatterns([
      { ...cagedE, recommended: false },
      { ...positionFour, recommended: true },
    ])
    const groups = groupScalePatternsForDisplay(rankedDuplicates)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.pattern.id).toBe(rankedDuplicates[0]?.id)
    expect(groups[0]?.pattern.recommended).toBe(true)
    expect(groups[0]?.equivalentIds).toEqual(expect.arrayContaining([cagedE.id, positionFour.id]))
    expect(groups[0]?.aliasNames).toContain(
      rankedDuplicates.find((pattern) => pattern.id !== groups[0]?.pattern.id)?.name,
    )

    const changedFingering = {
      ...positionFour,
      id: `${positionFour.id}-other-fingering`,
      locations: positionFour.locations.map((location, index) =>
        index === 0 ? { ...location, finger: location.finger === 1 ? 2 as const : 1 as const } : location,
      ),
    }
    expect(groupScalePatternsForDisplay([cagedE, changedFingering])).toHaveLength(2)
    const movedShape = {
      ...positionFour,
      id: `${positionFour.id}-octave-up`,
      locations: positionFour.locations.map((location) => ({
        ...location,
        id: `${location.id}-octave-up`,
        fret: location.fret + 12,
        midi: location.midi + 12,
      })),
    }
    expect(groupScalePatternsForDisplay([cagedE, movedShape])).toHaveLength(2)
  })

  it('меняет ранжирование по профилю, не скрывая формы', () => {
    const patterns = generateGuitarPatterns(DEFAULT_GUITAR_CONFIG, cMajor.ascending, 'ascending')
    const compact = rankScalePatterns(patterns, {
      reachProfile: 'compact', playerLevel: 'beginner', handSize: 'small',
    })
    const stretch = rankScalePatterns(patterns, {
      reachProfile: 'stretch', playerLevel: 'advanced', handSize: 'large',
    })
    expect(compact.map((pattern) => pattern.id).sort()).toEqual(stretch.map((pattern) => pattern.id).sort())
    expect(compact.map((pattern) => pattern.id)).not.toEqual(stretch.map((pattern) => pattern.id))
    expect(compact[0]?.ergonomics?.fretSpan).toBeLessThanOrEqual(5)
  })

  it('динамически выбирает старт 2+3+3+3+4 с пятой или шестой струны', () => {
    const cases = [
      { tonic: 0, expectedVariant: 'root-5' },
      { tonic: 2, expectedVariant: 'root-5' },
      { tonic: 7, expectedVariant: 'root-6' },
      { tonic: 11, expectedVariant: 'root-6' },
    ]
    const winners = cases.map(({ tonic, expectedVariant }) => {
      const scale = buildScale({
        tonic,
        mode: 'major',
        spelling: defaultSpellingForMajorPitch(tonic),
      })
      const candidates = generateTwoOctaveHybridPatterns(DEFAULT_GUITAR_CONFIG, scale.ascending)
        .filter((pattern) => pattern.variantGroupId === 'two-octave-two-three-three-three-four')
      expect(candidates).toHaveLength(2)
      const winner = rankScalePatterns(candidates)[0]
      expect(winner?.variantId).toBe(expectedVariant)
      return winner?.variantId
    })
    expect(new Set(winners)).toEqual(new Set(['root-5', 'root-6']))

    const cPatterns = generateGuitarPatterns(
      DEFAULT_GUITAR_CONFIG,
      cMajor.ascending,
      'ascending',
    ).filter((pattern) =>
      pattern.variantGroupId === 'two-octave-two-three-three-three-four')
    expect(cPatterns.filter((pattern) => pattern.preferredVariant)).toHaveLength(1)
    expect(cPatterns.find((pattern) => pattern.preferredVariant)?.variantId).toBe('root-5')
    expect(cPatterns.find((pattern) => pattern.preferredVariant)?.recommended).toBe(true)
  })

  it('транспонирует точные CAGED, 3NPS и двухоктавные гибриды во все 12 тональностей', () => {
    for (let tonic = 0; tonic < 12; tonic += 1) {
      const scale = buildScale({
        tonic,
        mode: 'major',
        spelling: defaultSpellingForMajorPitch(tonic),
      })
      const patterns = [
        ...generateCuratedCagedPatterns(DEFAULT_GUITAR_CONFIG, scale.ascending),
        ...generateCuratedThreeNpsPatterns(DEFAULT_GUITAR_CONFIG, scale.ascending),
        ...generateTwoOctaveHybridPatterns(DEFAULT_GUITAR_CONFIG, scale.ascending),
      ]
      expect(patterns).toHaveLength(15)
      patterns.forEach((pattern) => expectPatternIntegrity(pattern, tonic))
    }
  })

  it('поддерживает все минорные варианты без потери пяти CAGED и семи 3NPS', () => {
    const variants = ['natural', 'harmonic', 'melodic-classical', 'melodic-jazz'] as const
    variants.forEach((variant) => {
      const scale = buildScale({ tonic: 9, mode: 'minor', spelling: 'sharp' }, variant)
      expect(generateCuratedCagedPatterns(DEFAULT_GUITAR_CONFIG, scale.ascending)).toHaveLength(5)
      expect(generateCuratedThreeNpsPatterns(DEFAULT_GUITAR_CONFIG, scale.ascending)).toHaveLength(7)
      expect(generateTwoOctaveHybridPatterns(DEFAULT_GUITAR_CONFIG, scale.ascending)).toHaveLength(3)
      generateGuitarPatterns(DEFAULT_GUITAR_CONFIG, scale.ascending, 'ascending')
        .forEach((pattern) => expectPatternIntegrity(pattern, 9))
    })
  })

  it('содержит привычный тонический box A natural minor', () => {
    const aMinor = buildScale({ tonic: 9, mode: 'minor', spelling: 'sharp' }, 'natural')
    const box = generatePositionalPatterns(DEFAULT_GUITAR_CONFIG, aMinor.ascending)
      .find((pattern) => pattern.sourceId === 'position-p5')
    expect(DEFAULT_GUITAR_CONFIG.strings.map((_, stringIndex) =>
      box?.locations
        .filter((location) => location.stringIndex === stringIndex)
        .map((location) => location.fret),
    )).toEqual([
      [5, 7, 8],
      [5, 7, 8],
      [5, 7, 9],
      [5, 7, 9],
      [6, 8],
      [5, 7, 8],
    ])
    const recommended = generateGuitarPatterns(
      DEFAULT_GUITAR_CONFIG,
      aMinor.ascending,
      'ascending',
    )
    expect(recommended.find((pattern) => pattern.sourceId === 'position-p5')?.recommended).toBe(true)
  })

  it('использует верхний стандартный блок на 7/8 струнах и сохраняет расширенный низ', () => {
    const configs = [
      { ...DEFAULT_GUITAR_CONFIG, presetId: '7-standard-b', strings: [35, 40, 45, 50, 55, 59, 64] },
      { ...DEFAULT_GUITAR_CONFIG, presetId: '8-standard-fs', strings: [30, 35, 40, 45, 50, 55, 59, 64] },
    ]
    configs.forEach((config, index) => {
      const offset = index + 1
      const caged = generateCuratedCagedPatterns(config, cMajor.ascending)
      const nps = generateCuratedThreeNpsPatterns(config, cMajor.ascending)
      const twoOctave = generateTwoOctaveHybridPatterns(config, cMajor.ascending)
      expect(caged).toHaveLength(5)
      expect(nps).toHaveLength(7)
      expect(twoOctave).toHaveLength(3)
      ;[...caged, ...nps].forEach((pattern) => {
        expect(Math.min(...pattern.locations.map((location) => location.stringIndex))).toBe(offset)
        expect(Math.max(...pattern.locations.map((location) => location.stringIndex))).toBe(offset + 5)
      })
      twoOctave.forEach((pattern) => {
        const minString = Math.min(...pattern.locations.map((location) => location.stringIndex))
        const maxString = Math.max(...pattern.locations.map((location) => location.stringIndex))
        expect(minString).toBeGreaterThanOrEqual(offset)
        expect(maxString).toBeLessThanOrEqual(offset + 5)
        if (pattern.sourceId === 'two-octave-two-three-three-three-four-root-6') {
          expect([minString, maxString]).toEqual([offset, offset + 4])
        } else if (pattern.sourceId === 'two-octave-two-three-three-three-four-root-5') {
          expect([minString, maxString]).toEqual([offset + 1, offset + 5])
        } else {
          expect([minString, maxString]).toEqual([offset, offset + 5])
        }
      })
      const extended = generateExtendedScalePatterns(config, cMajor.ascending)
      expect(extended.some((pattern) =>
        pattern.locations.some((location) => location.stringIndex < offset),
      )).toBe(true)
    })
  })

  it('оставляет рассчитанные семейства для Drop D, когда CAGED недоступен', () => {
    const dropD = { ...DEFAULT_GUITAR_CONFIG, presetId: '6-drop-d', strings: [38, 45, 50, 55, 59, 64] }
    const patterns = generateGuitarPatterns(dropD, cMajor.ascending, 'ascending')
    expect(patterns.filter((pattern) => pattern.system === 'caged')).toHaveLength(0)
    expect(patterns.some((pattern) => pattern.system === 'position')).toBe(true)
    expect(patterns.some((pattern) => pattern.system === 'one-octave')).toBe(true)
    expect(patterns.filter((pattern) => pattern.system === 'two-octave')).toHaveLength(3)
    expect(patterns.some((pattern) => pattern.system === 'extended')).toBe(true)
    patterns.forEach((pattern) => pattern.locations.forEach((location) => {
      expect(location.fret).toBeGreaterThanOrEqual(0)
      expect(location.fret).toBeLessThanOrEqual(dropD.frets)
      expect(location.midi).toBe((dropD.strings[location.stringIndex] ?? 0) + location.fret)
    }))
  })

  it('принимает старые сохранённые настройки и дополняет профиль значениями по умолчанию', () => {
    const oldPreferences = structuredClone(DEFAULT_GUITAR_PREFERENCES)
    delete oldPreferences.scaleReachProfile
    delete oldPreferences.playerLevel
    delete oldPreferences.handSize
    delete oldPreferences.showScaleFingerings
    delete oldPreferences.showScaleShifts
    expect(isGuitarPreferences(oldPreferences)).toBe(true)
    expect(scaleGenerationOptions(oldPreferences)).toEqual({
      reachProfile: 'balanced', playerLevel: 'intermediate', handSize: 'medium',
    })
    expect(isGuitarPreferences({ ...oldPreferences, handSize: 'giant' })).toBe(false)
  })

  it('находит стандартную открытую форму C major среди аккордовых аппликатур', () => {
    const chord = harmonizeScale(cMajor.ascending)[0]?.triad
    expect(chord).toBeDefined()
    if (!chord) return
    const voicings = generateVoicings({
      config: DEFAULT_GUITAR_CONFIG,
      chord,
      constraints: DEFAULT_VOICING_CONSTRAINTS,
    })
    expect(voicings.some((voicing) => voicing.frets.join(',') === '-1,3,2,0,1,0')).toBe(true)
  })
})
