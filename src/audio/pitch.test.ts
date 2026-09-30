import { describe, expect, it, vi } from 'vitest'
import { formatOpenString } from '../instruments/guitar'
import {
  createRandom,
  highpass,
  lowpass,
  mixInto,
  noise,
  pluck,
  rmsOf,
} from '../test/pluckedString'
import {
  createInstrumentDetector,
  freqFromMidi,
  midiFromFreq,
  MIN_CLARITY,
  type InstrumentRange,
} from './pitch'

// Signal processing over synthesised audio: tight loops that coverage
// instrumentation slows several times over. Every case is sized to finish in
// about a second on a laptop; this is headroom for a slow CI runner.
vi.setConfig({ testTimeout: 20_000 })

const SAMPLE_RATE = 48000

interface Room {
  /** How far the played note stands above the room, over the whole band. */
  snrDb: number
  /** A microphone that drops everything below this, 12 dB/oct per section. */
  highpassHz?: number
  sections?: number
  stiffness?: number
  /** Skip the low-pass the listener puts in front of the detector. */
  unfiltered?: boolean
}

const GUITAR: InstrumentRange = { lowestMidi: 40, highestMidi: 88 }
const GUITAR_8_DROP_E: InstrumentRange = { lowestMidi: 28, highestMidi: 88 }
const BASS: InstrumentRange = { lowestMidi: 28, highestMidi: 67 }
const BASS_5: InstrumentRange = { lowestMidi: 23, highestMidi: 67 }

const DIRECT: Room = { snrDb: 45 }
const LAPTOP_MIC: Room = { snrDb: 25, highpassHz: 200 }
/** A solid-body electric played unplugged: thin, quiet, no lows to speak of. */
const UNPLUGGED: Room = { snrDb: 10, highpassHz: 700, sections: 2 }

const notesBetween = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index)

/**
 * The notes the detector gets wrong `afterMs` into the attack, written
 * "played→heard" so a failing run names them. Every note of the range unless
 * told otherwise.
 */
function misheard(
  range: InstrumentRange,
  room: Room,
  afterMs: number,
  notes = notesBetween(range.lowestMidi, range.highestMidi),
): string[] {
  const detector = createInstrumentDetector({ sampleRate: SAMPLE_RATE, ...range })
  const preRoll = detector.sourceSize + Math.floor(SAMPLE_RATE * 0.05)
  const failures: string[] = []

  for (const midi of notes) {
    const random = createRandom(midi * 101 + afterMs)
    let note = pluck({
      midi,
      sampleRate: SAMPLE_RATE,
      seconds: afterMs / 1000 + 0.05,
      random,
      stiffness: room.stiffness,
      detuneCents: (random() - 0.5) * 16,
    })
    if (room.highpassHz) note = highpass(note, SAMPLE_RATE, room.highpassHz, room.sections)
    const level = rmsOf(note, 0, Math.min(note.length, Math.floor(SAMPLE_RATE * 0.15)))
    const stream = noise(preRoll + note.length, level / 10 ** (room.snrDb / 20), random)
    mixInto(stream, note, preRoll)
    const input = room.unfiltered ? stream : lowpass(stream, SAMPLE_RATE, detector.lowpassHz)

    const end = preRoll + Math.floor((afterMs / 1000) * SAMPLE_RATE)
    const frame = detector.detect(input.subarray(end - detector.sourceSize, end))
    const heard =
      frame.freq !== null && frame.clarity >= MIN_CLARITY
        ? Math.round(midiFromFreq(frame.freq))
        : null
    if (heard !== midi) {
      failures.push(`${formatOpenString(midi)}→${heard === null ? '—' : formatOpenString(heard)}`)
    }
  }
  return failures
}

describe('определение высоты ноты', () => {
  it('переводит частоту в номер ноты и обратно', () => {
    expect(midiFromFreq(440)).toBe(69)
    expect(freqFromMidi(40)).toBeCloseTo(82.41, 2)
    expect(midiFromFreq(freqFromMidi(54.25))).toBeCloseTo(54.25, 6)
  })

  it('окно и фильтр подбираются под диапазон инструмента', () => {
    const guitar = createInstrumentDetector({ sampleRate: SAMPLE_RATE, ...GUITAR })
    expect(guitar.sourceSize).toBe(2048)
    expect(Math.round(guitar.lowpassHz)).toBe(1524)

    // Нижняя E1 не помещается в 43 мс, а децимировать нельзя из-за верхних нот.
    expect(createInstrumentDetector({ sampleRate: SAMPLE_RATE, ...GUITAR_8_DROP_E }).sourceSize).toBe(4096)

    const bass = createInstrumentDetector({ sampleRate: SAMPLE_RATE, ...BASS })
    expect(bass.sourceSize).toBe(8192)
    expect(bass.lowpassHz).toBe(900)
    expect(createInstrumentDetector({ sampleRate: SAMPLE_RATE, ...BASS_5 }).sourceSize).toBe(16384)
  })

  it.each([
    ['прямой сигнал', DIRECT],
    ['микрофон ноутбука', LAPTOP_MIC],
    ['неподключённая электрогитара', UNPLUGGED],
  ])('шестиструнка, %s: каждая нота от открытой шестой до 24-го лада первой', (_name, room) => {
    expect(misheard(GUITAR, room, 80)).toEqual([])
  })

  it('работает и на 44,1 кГц', () => {
    const detector = createInstrumentDetector({ sampleRate: 44100, ...GUITAR })
    const random = createRandom(7)
    const note = pluck({ midi: 42, sampleRate: 44100, seconds: 0.2, random })
    const frame = detector.detect(
      lowpass(note, 44100, detector.lowpassHz).subarray(4000, 4000 + detector.sourceSize),
    )
    expect(Math.round(midiFromFreq(frame.freq ?? 1))).toBe(42)
  })

  it('фильтр перед детектором — то, что вытягивает тихую неподключённую электрогитару', () => {
    // Жёсткие струны, низов нет, гитара всего на 6 дБ громче комнаты.
    const thin: Room = { snrDb: 6, highpassHz: 700, sections: 2, stiffness: 2.5e-4 }
    const notes = GUITAR.highestMidi - GUITAR.lowestMidi + 1

    expect(misheard(GUITAR, { ...thin, unfiltered: true }, 120).length).toBeGreaterThan(notes / 2)
    expect(misheard(GUITAR, thin, 120).length).toBeLessThanOrEqual(2)
  })

  // The two ends are what an eight-string is hard for: an E1 that needs a long
  // window and a top octave that a decimated one would drop by an octave.
  it.each([
    ['прямой сигнал', DIRECT],
    ['микрофон ноутбука', LAPTOP_MIC],
  ])('восьмиструнка, %s: нижние ноты слышны, верхние не проваливаются на октаву', (_name, room) => {
    const ends = [...notesBetween(28, 33), ...notesBetween(79, 88)]
    expect(misheard(GUITAR_8_DROP_E, room, 150, ends)).toEqual([])
  })

  it.each([
    ['прямой сигнал', DIRECT],
    ['микрофон ноутбука', LAPTOP_MIC],
  ])('бас, %s: каждая нота от E1 до G4', (_name, room) => {
    expect(misheard(BASS, room, 250)).toEqual([])
  })

  it('пятиструнный бас: нижняя октава от B0', () => {
    expect(misheard(BASS_5, DIRECT, 450, notesBetween(23, 34))).toEqual([])
  })

  it('шум комнаты нотой не считается', () => {
    const detector = createInstrumentDetector({ sampleRate: SAMPLE_RATE, ...GUITAR })
    const room = noise(detector.sourceSize * 4, 0.01, createRandom(3))
    const frame = detector.detect(
      lowpass(room, SAMPLE_RATE, detector.lowpassHz).subarray(detector.sourceSize),
    )
    expect(frame.clarity).toBeLessThan(MIN_CLARITY)
  })
})
