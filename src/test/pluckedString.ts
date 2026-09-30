import { freqFromMidi } from '../audio/pitch'
import { nextRandom } from '../practice/rng'

/**
 * Synthetic plucked strings with what a real room adds to them: stiff-string
 * inharmonicity, a microphone that drops the lows, broadband noise. The pitch
 * detector and the note tracker are tested against these instead of
 * recordings, so every case states exactly which impairment it is about.
 */

/** A repeatable stream of numbers in [0, 1). */
export function createRandom(seed: number): () => number {
  let state = seed
  return () => {
    const draw = nextRandom(state)
    state = draw.seed
    return draw.value
  }
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}

export interface PluckOptions {
  midi: number
  sampleRate: number
  seconds: number
  random: () => number
  /** Stiffness coefficient B: partial n sits at n·f0·√(1 + B·n²). */
  stiffness?: number
  detuneCents?: number
  level?: number
}

/**
 * Additive model of a plucked string. Partials are stretched by the stiffness,
 * shaped by where the string was picked, and the upper ones die first.
 */
export function pluck({
  midi,
  sampleRate,
  seconds,
  random,
  stiffness = 1e-4,
  detuneCents = 0,
  level = 0.5,
}: PluckOptions): Float32Array {
  const f0 = freqFromMidi(midi + detuneCents / 100)
  const length = Math.floor(sampleRate * seconds)
  const out = new Float32Array(length)
  const pickPosition = 0.12 + random() * 0.12
  const ceiling = Math.min(9000, sampleRate * 0.45)

  for (let n = 1; n <= 30; n += 1) {
    const partial = n * f0 * Math.sqrt(1 + stiffness * n * n)
    if (partial > ceiling) break
    const amplitude = Math.abs(Math.sin(n * Math.PI * pickPosition)) / n
    if (amplitude < 1e-4) continue
    const phase = random() * 2 * Math.PI
    const omega = (2 * Math.PI * partial) / sampleRate
    const decay = Math.exp(-1 / ((1.4 / (1 + 0.03 * n * n)) * sampleRate))
    let envelope = amplitude
    for (let i = 0; i < length; i += 1) {
      out[i] = (out[i] ?? 0) + envelope * Math.sin(omega * i + phase)
      envelope *= decay
    }
  }

  // Pick noise: a few milliseconds of broadband hash on top of the attack.
  const attack = Math.floor(sampleRate * 0.006)
  for (let i = 0; i < attack && i < length; i += 1) {
    out[i] = (out[i] ?? 0) + gaussian(random) * 0.6 * (1 - i / attack)
  }

  let peak = 0
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i] ?? 0))
  const gain = peak > 0 ? level / peak : 0
  for (let i = 0; i < length; i += 1) out[i] = (out[i] ?? 0) * gain
  return out
}

type BiquadKind = 'lowpass' | 'highpass'

/** Butterworth sections in series, 12 dB per octave each. */
function biquad(
  signal: Float32Array,
  sampleRate: number,
  cutoff: number,
  sections: number,
  kind: BiquadKind,
): Float32Array {
  const w0 = (2 * Math.PI * cutoff) / sampleRate
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2)
  const a0 = 1 + alpha
  const edge = (kind === 'lowpass' ? 1 - cos : 1 + cos) / 2 / a0
  const b1 = (kind === 'lowpass' ? 1 - cos : -(1 + cos)) / a0
  const a1 = (-2 * cos) / a0
  const a2 = (1 - alpha) / a0

  let current = signal
  for (let section = 0; section < sections; section += 1) {
    const out = new Float32Array(current.length)
    let x1 = 0
    let x2 = 0
    let y1 = 0
    let y2 = 0
    for (let i = 0; i < current.length; i += 1) {
      const x = current[i] ?? 0
      const y = edge * x + b1 * x1 + edge * x2 - a1 * y1 - a2 * y2
      x2 = x1
      x1 = x
      y2 = y1
      y1 = y
      out[i] = y
    }
    current = out
  }
  return current
}

/** What a small microphone does to a guitar: the lows are simply not there. */
export function highpass(
  signal: Float32Array,
  sampleRate: number,
  cutoff: number,
  sections = 1,
): Float32Array {
  return biquad(signal, sampleRate, cutoff, sections, 'highpass')
}

/**
 * The pair of `BiquadFilterNode`s the listener puts in front of the detector,
 * for feeding it outside a browser.
 */
export function lowpass(signal: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  return biquad(signal, sampleRate, cutoff, 2, 'lowpass')
}

export function rmsOf(signal: Float32Array, from = 0, to = signal.length): number {
  let energy = 0
  for (let i = from; i < to; i += 1) {
    const sample = signal[i] ?? 0
    energy += sample * sample
  }
  return Math.sqrt(energy / Math.max(1, to - from))
}

export function noise(length: number, rms: number, random: () => number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i += 1) out[i] = gaussian(random) * rms
  return out
}

export function mixInto(target: Float32Array, source: Float32Array, offset = 0): Float32Array {
  const end = Math.min(target.length, offset + source.length)
  for (let i = Math.max(0, offset); i < end; i += 1) {
    target[i] = (target[i] ?? 0) + (source[i - offset] ?? 0)
  }
  return target
}
