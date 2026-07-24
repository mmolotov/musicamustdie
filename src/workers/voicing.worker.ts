import { generateVoicings, type GenerateVoicingsRequest } from '../instruments/guitar'

self.onmessage = (event: MessageEvent<GenerateVoicingsRequest>) => {
  try {
    const voicings = generateVoicings(event.data)
    self.postMessage({ ok: true, voicings })
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : 'Не удалось построить аппликатуры',
    })
  }
}

export {}
