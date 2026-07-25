import { generateVoicings, type GenerateVoicingsRequest } from '../instruments/guitar'

self.onmessage = (event: MessageEvent<GenerateVoicingsRequest>) => {
  try {
    const voicings = generateVoicings(event.data)
    self.postMessage({ ok: true, voicings })
  } catch {
    // The main thread owns the (localized) error text; just signal failure.
    self.postMessage({ ok: false })
  }
}

export {}
