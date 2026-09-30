import { describe, expect, it, vi } from 'vitest'
import {
  createRandom,
  highpass,
  lowpass,
  mixInto,
  noise,
  pluck,
  rmsOf,
} from '../test/pluckedString'
import { attackRatio, createNoteTracker, type NoteEvent } from './noteTracker'
import { createInstrumentDetector, freqFromMidi } from './pitch'

// Whole performances are synthesised and analysed sample by sample, and
// coverage instrumentation slows those loops several times over. Every case
// takes about a second on a laptop; this is headroom for a slow CI runner.
vi.setConfig({ testTimeout: 20_000 })

const SAMPLE_RATE = 48000
/** The listener polls every 20 ms; a slightly longer hop is the harder case. */
const HOP = Math.floor(SAMPLE_RATE * 0.025)
const CALIBRATION_SECONDS = 0.6

const seconds = (value: number) => Math.floor(value * SAMPLE_RATE)

interface Played {
  at: number
  midi: number
  /** Damp the string this long after the attack. */
  muteAfter?: number
  level?: number
  length?: number
  detuneCents?: number
}

interface Room {
  highpassHz: number
  sections: number
  /** RMS the first note is scaled to, as the microphone delivers it. */
  noteRms: number
  snrDb: number
  hum?: boolean
}

const LAPTOP_MIC: Room = { highpassHz: 200, sections: 1, noteRms: 0.05, snrDb: 22 }
/** A solid-body electric played unplugged in front of a laptop. */
const UNPLUGGED: Room = { highpassHz: 700, sections: 2, noteRms: 0.005, snrDb: 10 }

function damp(signal: Float32Array, after: number): Float32Array {
  const from = seconds(after)
  const fade = seconds(0.035)
  for (let i = from; i < signal.length; i += 1) {
    signal[i] = (signal[i] ?? 0) * Math.max(0, 1 - (i - from) / fade)
  }
  return signal
}

function playNote(note: Played, random: () => number): Float32Array {
  const signal = pluck({
    midi: note.midi,
    sampleRate: SAMPLE_RATE,
    seconds: note.length ?? 1.2,
    level: note.level ?? 0.5,
    detuneCents: note.detuneCents ?? (random() - 0.5) * 14,
    random,
  })
  return note.muteAfter === undefined ? signal : damp(signal, note.muteAfter)
}

/** A finger sliding from one fret to the next while the string keeps ringing. */
function slide(from: number, to: number, slideAt: number, random: () => number): Float32Array {
  const length = seconds(1.2)
  const out = new Float32Array(length)
  for (let n = 1; n <= 20; n += 1) {
    const amplitude = Math.abs(Math.sin(n * Math.PI * 0.17)) / n
    const tau = 1.4 / (1 + 0.03 * n * n)
    let phase = random() * 2 * Math.PI
    for (let i = 0; i < length; i += 1) {
      const t = i / SAMPLE_RATE
      const progress = Math.max(0, Math.min(1, (t - slideAt) / 0.07))
      phase += (2 * Math.PI * n * freqFromMidi(from + (to - from) * progress)) / SAMPLE_RATE
      out[i] = (out[i] ?? 0) + amplitude * Math.exp(-t / tau) * Math.sin(phase)
    }
  }
  const peak = out.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0)
  return out.map((sample) => (sample * 0.5) / peak)
}

/** A slap on muted strings: loud, broadband, no pitch. */
function slap(random: () => number): Float32Array {
  return noise(seconds(0.15), 0.3, random).map(
    (sample, i) => sample * Math.exp(-i / seconds(0.03)),
  )
}

function mainsHum(length: number, rms: number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE
    out[i] =
      rms * Math.SQRT2 * (Math.sin(2 * Math.PI * 50 * t) + 0.4 * Math.sin(2 * Math.PI * 150 * t))
  }
  return out
}

interface Performance {
  total: number
  notes?: Played[]
  extra?: { at: number; signal: (random: () => number) => Float32Array }[]
}

/** What the tracker reports for a performance heard through a given room. */
function listen(performance: Performance, room: Room, seed = 1): NoteEvent[] {
  const random = createRandom(seed)
  const length = seconds(performance.total)
  const played = new Float32Array(length)
  for (const note of performance.notes ?? []) mixInto(played, playNote(note, random), seconds(note.at))
  for (const extra of performance.extra ?? []) mixInto(played, extra.signal(random), seconds(extra.at))
  const dry = highpass(played, SAMPLE_RATE, room.highpassHz, room.sections)

  // The room is described the way a microphone meets it: how loud the first
  // note arrives, and how far it stands above the noise.
  const first = performance.notes?.[0] ?? performance.extra?.[0]
  const loudness = first ? rmsOf(dry, seconds(first.at), seconds(first.at + 0.15)) : 0
  const gain = loudness > 0 ? room.noteRms / loudness : 1
  const stream = noise(length, room.noteRms / 10 ** (room.snrDb / 20), random)
  mixInto(stream, dry.map((sample) => sample * gain))
  if (room.hum) mixInto(stream, mainsHum(length, room.noteRms / 8))

  const detector = createInstrumentDetector({
    sampleRate: SAMPLE_RATE,
    lowestMidi: 40,
    highestMidi: 88,
  })
  const filtered = lowpass(stream, SAMPLE_RATE, detector.lowpassHz)
  const tracker = createNoteTracker()
  const events: NoteEvent[] = []
  for (let end = detector.sourceSize; end <= length; end += HOP) {
    const time = end / SAMPLE_RATE
    const frame = detector.detect(filtered.subarray(end - detector.sourceSize, end))
    if (time < CALIBRATION_SECONDS) {
      tracker.calibrate(frame.rms)
      continue
    }
    // The pitch is read after the low-pass; the attack is read before it.
    const attack = attackRatio(stream.subarray(end - 2048, end))
    const event = tracker.push({ ...frame, time, attack })
    if (event) events.push(event)
  }
  return events
}

const heard = (performance: Performance, room: Room) =>
  listen(performance, room).map((event) => event.midi)

const FOUR_NOTES: Performance = {
  total: 3.7,
  notes: [54, 42, 66, 78].map((midi, index) => ({ midi, at: 0.8 + index * 0.7, muteAfter: 0.5 })),
}
const REPICKED: Performance = {
  total: 2.7,
  notes: [
    { midi: 54, at: 0.8 },
    { midi: 54, at: 1.5 },
  ],
}
const FAST_RUN: Performance = {
  total: 3.2,
  notes: [40, 45, 50, 55, 59, 64, 59, 55].map((midi, index) => ({
    midi,
    at: 0.8 + index * 0.25,
    muteAfter: 0.24,
  })),
}

describe('трекер сыгранных нот', () => {
  it('отдаёт по одному событию на ноту — и быстро', () => {
    const events = listen(FOUR_NOTES, LAPTOP_MIC)
    expect(events.map((event) => event.midi)).toEqual([54, 42, 66, 78])

    // Задержка от атаки до события: заметно меньше, чем время реакции.
    events.forEach((event, index) => {
      const delay = event.time - (0.8 + index * 0.7)
      expect(delay).toBeGreaterThan(0.04)
      expect(delay).toBeLessThan(0.2)
    })
  })

  it('слышит повторный щипок по ещё звучащей струне', () => {
    expect(heard(REPICKED, LAPTOP_MIC)).toEqual([54, 54])
  })

  it('слышит новую ноту поверх звучащей на другой струне', () => {
    const performance: Performance = {
      total: 2.7,
      notes: [
        { midi: 45, at: 0.8 },
        { midi: 54, at: 1.4 },
      ],
    }
    expect(heard(performance, LAPTOP_MIC)).toEqual([45, 54])
  })

  it('слайд на соседний лад без новой атаки — это новая нота', () => {
    const performance: Performance = {
      total: 2.2,
      extra: [{ at: 0.8, signal: (random) => slide(55, 54, 0.45, random) }],
    }
    expect(heard(performance, LAPTOP_MIC)).toEqual([55, 54])
  })

  it('тихий призвук открытой струны после ноты не считается', () => {
    const performance: Performance = {
      total: 3,
      notes: [
        { midi: 57, at: 0.8, muteAfter: 0.6 },
        { midi: 45, at: 0.85, level: 0.04, length: 2 },
      ],
    }
    expect(heard(performance, LAPTOP_MIC)).toEqual([57])
  })

  it('удар по заглушённым струнам — не нота', () => {
    const performance: Performance = {
      total: 3.2,
      notes: [
        { midi: 52, at: 0.8, muteAfter: 0.5 },
        { midi: 59, at: 2.3, muteAfter: 0.6 },
      ],
      extra: [{ at: 1.6, signal: slap }],
    }
    expect(heard(performance, LAPTOP_MIC)).toEqual([52, 59])
  })

  it('молчит, когда в комнате только шум и гул сети', () => {
    expect(heard({ total: 3 }, { ...LAPTOP_MIC, hum: true })).toEqual([])
  })

  it('успевает за восьмыми в 120 ударов в минуту', () => {
    expect(heard(FAST_RUN, LAPTOP_MIC)).toEqual([40, 45, 50, 55, 59, 64, 59, 55])
  })

  it.each([
    ['четыре ноты с глушением', FOUR_NOTES, [54, 42, 66, 78]],
    ['повторный щипок', REPICKED, [54, 54]],
    ['быстрый пассаж', FAST_RUN, [40, 45, 50, 55, 59, 64, 59, 55]],
  ])('на тихой неподключённой электрогитаре: %s', (_name, performance, notes) => {
    expect(heard(performance, UNPLUGGED)).toEqual(notes)
  })

  it('сообщает, насколько нота выше или ниже строя', () => {
    const [event] = listen(
      { total: 2, notes: [{ midi: 57, at: 0.8, detuneCents: 20 }] },
      { highpassHz: 60, sections: 1, noteRms: 0.05, snrDb: 40 },
    )
    expect(event?.midi).toBe(57)
    expect(event?.cents).toBeGreaterThan(14)
    expect(event?.cents).toBeLessThan(26)
  })

  it('гейт стоит над шумом комнаты, но не ниже своего минимума', () => {
    const quiet = createNoteTracker()
    quiet.calibrate(0)
    expect(quiet.gate).toBe(0.001)

    const noisy = createNoteTracker()
    for (let i = 0; i < 20; i += 1) noisy.calibrate(0.01)
    expect(noisy.gate).toBeCloseTo(0.025, 6)
  })
})

describe('attackRatio', () => {
  it('около единицы на ровном звуке и подскакивает на атаке', () => {
    const steady = new Float32Array(2048).map((_, i) => Math.sin(i * 0.2))
    expect(attackRatio(steady)).toBeCloseTo(1, 1)

    const attack = new Float32Array(2048).map((_, i) => (i < 1024 ? 0.01 : 1) * Math.sin(i * 0.2))
    expect(attackRatio(attack)).toBeGreaterThan(100)

    expect(attackRatio(new Float32Array(2048))).toBe(1)
  })
})
