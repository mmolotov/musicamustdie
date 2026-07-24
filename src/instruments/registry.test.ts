import { afterEach, describe, expect, it } from 'vitest'
import type { InstrumentModule } from './types'
import {
  clearInstrumentRegistry,
  getInstrument,
  listInstruments,
  registerInstrument,
} from './registry'

interface FakeConfig {
  range: number
}

const fakeModule: InstrumentModule<FakeConfig> = {
  id: 'contract-test-keyboard',
  label: 'Тестовая клавиатура',
  family: 'keyboard',
  capabilities: {
    fretboard: false,
    tablature: false,
    chordDiagrams: false,
    keyboard: true,
    fingerings: true,
  },
  defaultConfig: { range: 61 },
  validateConfig: (value): value is FakeConfig =>
    typeof value === 'object' && value !== null && 'range' in value && typeof value.range === 'number',
  locateScale: () => [],
  generatePatterns: () => [],
  getChordEvents: (_config, chord) =>
    chord.pitchClasses.map((pitchClass) => ({ midi: 60 + pitchClass, startBeat: 0, durationBeats: 1 })),
}

afterEach(() => clearInstrumentRegistry())

describe('реестр инструментальных модулей', () => {
  it('подключает новый тип инструмента без знания его конфигурации', () => {
    registerInstrument(fakeModule)
    expect(getInstrument(fakeModule.id)?.capabilities.keyboard).toBe(true)
    expect(listInstruments().map((instrument) => instrument.id)).toEqual([fakeModule.id])
  })

  it('не допускает случайную повторную регистрацию id', () => {
    registerInstrument(fakeModule)
    expect(() => registerInstrument(fakeModule)).toThrow(/уже зарегистрирован/)
  })
})
