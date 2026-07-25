import { useEffect, useState } from 'react'
import {
  generateVoicings,
  type GenerateVoicingsRequest,
  type GuitarVoicing,
} from '../instruments/guitar'
import { pick } from '../i18n'

interface WorkerResult {
  ok: boolean
  voicings?: GuitarVoicing[]
}

interface VoicingState {
  voicings: GuitarVoicing[]
  loading: boolean
  error: string | null
}

export function useVoicings(request: GenerateVoicingsRequest | null): VoicingState {
  const [state, setState] = useState<VoicingState>({
    voicings: [],
    loading: Boolean(request),
    error: null,
  })

  useEffect(() => {
    if (!request) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset when the request clears; the async worker/timeout paths set state in callbacks
      setState({ voicings: [], loading: false, error: null })
      return
    }

    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))

    if (typeof Worker === 'undefined') {
      const timer = window.setTimeout(() => {
        if (cancelled) return
        try {
          setState({ voicings: generateVoicings(request), loading: false, error: null })
        } catch {
          setState({ voicings: [], loading: false, error: pick('Не удалось построить аппликатуры', 'Could not build fingerings') })
        }
      }, 0)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }

    const worker = new Worker(new URL('../workers/voicing.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      if (cancelled) return
      if (event.data.ok) {
        setState({ voicings: event.data.voicings ?? [], loading: false, error: null })
      } else {
        setState({ voicings: [], loading: false, error: pick('Не удалось построить аппликатуры', 'Could not build fingerings') })
      }
    }
    worker.onerror = () => {
      if (!cancelled) {
        setState({ voicings: [], loading: false, error: pick('Ошибка фонового расчёта', 'Background computation error') })
      }
    }
    worker.postMessage(request)

    return () => {
      cancelled = true
      worker.terminate()
    }
  }, [request])

  return state
}
