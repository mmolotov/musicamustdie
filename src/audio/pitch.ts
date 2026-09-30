export function midiFromFreq(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440)
}

export function freqFromMidi(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** One analysis window: the pitch it holds, how periodic it is, how loud. */
export interface PitchFrame {
  /** Hertz, or null when no period was found at all. */
  freq: number | null
  /** 1 is a perfectly periodic window; room noise sits near 0. */
  clarity: number
  rms: number
}

/** Frames this periodic are taken as a note; below it the window is noise. */
export const MIN_CLARITY = 0.8

interface YinOptions {
  sampleRate: number
  bufferSize: number
  fmin: number
  fmax: number
  threshold?: number
  margin?: number
}

/**
 * YIN (de Cheveigné & Kawahara, 2002): difference function, cumulative mean
 * normalisation, first dip under a threshold, parabolic interpolation.
 *
 * One deviation from the paper: the threshold is lifted to `globalMin + margin`
 * when the best dip of the frame is shallow. Without it a slightly noisy frame
 * whose true period sits just above the threshold falls through to the next
 * dip — twice the period, an octave too low.
 */
export function createYin({
  sampleRate,
  bufferSize,
  fmin,
  fmax,
  threshold = 0.15,
  margin = 0.05,
}: YinOptions): (x: Float32Array) => PitchFrame {
  const tauMax = Math.min(Math.ceil(sampleRate / fmin), Math.floor(bufferSize / 2))
  const tauMin = Math.max(2, Math.floor(sampleRate / fmax))
  const integration = bufferSize - tauMax - 1
  const cmnd = new Float32Array(tauMax + 2)

  return (x) => {
    let energy = 0
    for (let j = 0; j < bufferSize; j += 1) {
      const sample = x[j] ?? 0
      energy += sample * sample
    }
    const rms = Math.sqrt(energy / bufferSize)

    cmnd[0] = 1
    let running = 0
    for (let tau = 1; tau <= tauMax + 1; tau += 1) {
      let sum = 0
      for (let j = 0; j < integration; j += 1) {
        const diff = (x[j] ?? 0) - (x[j + tau] ?? 0)
        sum += diff * diff
      }
      running += sum
      cmnd[tau] = running > 0 ? (sum * tau) / running : 1
    }

    let globalMin = Infinity
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      const value = cmnd[tau] ?? 1
      if (value < globalMin) globalMin = value
    }
    const limit = Math.max(threshold, globalMin + margin)

    let picked = -1
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      if ((cmnd[tau] ?? 1) < limit) {
        while (tau + 1 <= tauMax && (cmnd[tau + 1] ?? 1) < (cmnd[tau] ?? 1)) tau += 1
        picked = tau
        break
      }
    }
    if (picked === -1) return { freq: null, clarity: 0, rms }

    const a = cmnd[picked - 1] ?? 1
    const b = cmnd[picked] ?? 1
    const c = cmnd[picked + 1] ?? 1
    const denominator = a - 2 * b + c
    const shift = denominator !== 0 ? (0.5 * (a - c)) / denominator : 0
    const period = picked + Math.max(-1, Math.min(1, shift))
    return { freq: sampleRate / period, clarity: 1 - b, rms }
  }
}

const DECIMATOR_TAPS = 47

/** Windowed-sinc low-pass followed by decimation — cheap long windows for bass. */
function createDecimator(factor: number): (x: Float32Array) => Float32Array {
  if (factor === 1) return (x) => x
  const kernel = new Float32Array(DECIMATOR_TAPS)
  const cutoff = 0.5 / factor
  const mid = (DECIMATOR_TAPS - 1) / 2
  let total = 0
  for (let i = 0; i < DECIMATOR_TAPS; i += 1) {
    const n = i - mid
    const sinc = n === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n)
    const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (DECIMATOR_TAPS - 1))
    kernel[i] = sinc * hamming
    total += sinc * hamming
  }
  for (let i = 0; i < DECIMATOR_TAPS; i += 1) kernel[i] = (kernel[i] ?? 0) / total

  return (x) => {
    const out = new Float32Array(decimatedLength(x.length, factor))
    for (let o = 0; o < out.length; o += 1) {
      const start = o * factor
      let acc = 0
      for (let k = 0; k < DECIMATOR_TAPS; k += 1) acc += (x[start + k] ?? 0) * (kernel[k] ?? 0)
      out[o] = acc
    }
    return out
  }
}

function decimatedLength(sourceLength: number, factor: number): number {
  return factor === 1 ? sourceLength : Math.floor((sourceLength - DECIMATOR_TAPS) / factor) + 1
}

export interface InstrumentRange {
  /** The lowest open string. */
  lowestMidi: number
  /** The top fret of the highest string. */
  highestMidi: number
}

export interface InstrumentDetector {
  /** How many of the newest samples `detect` wants — a power of two. */
  sourceSize: number
  windowMs: number
  /**
   * What the signal should be low-passed to before it gets here — twice, 24 dB
   * per octave. An unplugged electric is thin and quiet: most of what the
   * microphone picks up above the top fret is room noise and partials a stiff
   * string has stretched out of tune, and both blur the period.
   */
  lowpassHz: number
  detect: (buffer: Float32Array) => PitchFrame
}

/**
 * A detector sized for one instrument, from its lowest open string to its
 * highest fret.
 *
 * The lowest note decides how long the window is — two periods of a 31 Hz B0
 * do not fit in 43 ms. The highest note decides the sample rate: decimation
 * makes long windows cheap, but a 1 kHz period is eleven samples at 12 kHz,
 * too coarse for the dip to land on, so only instruments that stop around
 * 500 Hz (bass) are decimated.
 */
export function createInstrumentDetector({
  sampleRate,
  lowestMidi,
  highestMidi,
}: InstrumentRange & { sampleRate: number }): InstrumentDetector {
  const fmin = freqFromMidi(lowestMidi - 1.5)
  const fmax = freqFromMidi(highestMidi + 1.5)
  const factor = fmax <= 520 ? 4 : 1
  const short = fmin >= 60
  const long = fmin < 36
  const sourceSize = short ? 2048 : (long ? 8192 : 4096) * (factor === 1 ? 1 : 2)
  const decimate = createDecimator(factor)
  const yin = createYin({
    sampleRate: sampleRate / factor,
    bufferSize: decimatedLength(sourceSize, factor),
    fmin,
    fmax,
  })
  return {
    sourceSize,
    windowMs: (sourceSize / sampleRate) * 1000,
    lowpassHz: Math.max(900, fmax * 1.06),
    detect: (buffer) => yin(decimate(buffer)),
  }
}
