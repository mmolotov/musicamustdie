import type { Page } from '@playwright/test'

declare global {
  interface Window {
    __pluck: (midi: number, seconds?: number) => void
    /** Device ids the app asked `getUserMedia` for, in order; null is "default". */
    __requestedInputs: (string | null)[]
  }
}

export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64]
export const BASS_TUNING = [28, 33, 38, 43]

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/**
 * Runs in the page before the app does. The trainer's microphone is replaced
 * by a stream the page synthesises itself, and `__pluck(midi)` plays a note
 * into it — a plucked string with its overtones and a quiet room behind it.
 *
 * Everything past `getUserMedia` is the real thing: the audio graph, the
 * filters, the detector and the tracker all run on these samples. It needs no
 * browser flags, so the suite behaves the same headless, headed and in CI.
 */
function plugIn(inputs: string[]) {
  let context: AudioContext | null = null
  let destination: MediaStreamAudioDestinationNode | null = null
  window.__requestedInputs = []

  const rig = () => {
    if (!context || !destination) {
      context = new AudioContext()
      destination = context.createMediaStreamDestination()
      const length = context.sampleRate * 2
      const buffer = context.createBuffer(1, length, context.sampleRate)
      const samples = buffer.getChannelData(0)
      for (let i = 0; i < length; i += 1) samples[i] = (Math.random() * 2 - 1) * 0.002
      const room = context.createBufferSource()
      room.buffer = buffer
      room.loop = true
      room.connect(destination)
      room.start()
    }
    return { context, destination }
  }

  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const audioConstraints = typeof constraints?.audio === 'object' ? constraints.audio : {}
    const wanted = audioConstraints.deviceId
    window.__requestedInputs.push(
      typeof wanted === 'object' && !Array.isArray(wanted) && typeof wanted.ideal === 'string'
        ? wanted.ideal
        : null,
    )
    const { context: audio, destination: output } = rig()
    await audio.resume()
    // A fresh stream per request, as a real device gives: the app stops the
    // tracks of the input it is leaving.
    return output.stream.clone()
  }

  // A machine with more than one way in: the built-in microphone and whatever
  // else the test plugs in.
  if (inputs.length > 0) {
    navigator.mediaDevices.enumerateDevices = async () =>
      inputs.map((label, index) => {
        const device = { deviceId: `input-${index}`, groupId: '', kind: 'audioinput' as const, label }
        return { ...device, toJSON: () => device }
      })
  }

  window.__pluck = (midi, seconds = 0.8) => {
    const { context: audio, destination: output } = rig()
    const f0 = 440 * 2 ** ((midi - 69) / 12)
    const start = audio.currentTime + 0.02
    for (let n = 1; n <= 12; n += 1) {
      // A stiff string: every partial a little sharp of the harmonic series.
      const frequency = n * f0 * Math.sqrt(1 + 1e-4 * n * n)
      if (frequency > 9000) break
      const amplitude = (0.25 * Math.abs(Math.sin(n * Math.PI * 0.17))) / n
      if (amplitude < 0.0005) continue
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(amplitude, start + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05 + seconds / (1 + 0.03 * n * n))
      oscillator.connect(gain).connect(output)
      oscillator.start(start)
      oscillator.stop(start + seconds + 0.1)
    }
  }
}

/**
 * Call before `page.goto`: the guitar has to be plugged in before the app
 * loads. `inputs` are the labels of the audio inputs the machine claims to have.
 */
export async function plugInVirtualGuitar(page: Page, inputs: string[] = []): Promise<void> {
  await page.addInitScript(plugIn, inputs)
}

/** A browser that refuses the microphone, the way a "Block" click does. */
export async function refuseMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
}

export async function pluck(page: Page, midi: number, seconds?: number): Promise<void> {
  await page.evaluate(([note, length]) => window.__pluck(note ?? 0, length), [midi, seconds])
}

export interface CardOnScreen {
  note: string
  stringNumber: number
  /** The pitch that answers it: the lowest fret of that note on that string. */
  midi: number
}

/** Reads the card the way a player does — the note and the string, off the screen. */
export async function cardOnScreen(page: Page, tuning = GUITAR_TUNING): Promise<CardOnScreen> {
  const note = (await page.locator('.neck-prompt strong').textContent()) ?? ''
  const string = (await page.locator('.neck-sub').textContent()) ?? ''
  const stringNumber = Number(string.match(/\d+/)?.[0])
  const open = tuning[tuning.length - stringNumber]
  const pitchClass = NOTE_NAMES.indexOf(note)
  if (open === undefined || pitchClass === -1) {
    throw new Error(`Cannot read the card: "${note}" on "${string}"`)
  }
  return { note, stringNumber, midi: open + ((pitchClass - (open % 12) + 12) % 12) }
}
