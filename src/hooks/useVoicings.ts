import { useEffect, useState } from 'react'
import {
  generateVoicings,
  type GenerateVoicingsRequest,
  type GuitarVoicing,
} from '../instruments/guitar'

interface WorkerResult {
  ok: boolean
  voicings?: GuitarVoicing[]
  message?: string
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
        } catch (error) {
          setState({
            voicings: [],
            loading: false,
            error: error instanceof Error ? error.message : 'Не удалось построить аппликатуры',
          })
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
        setState({
          voicings: [],
          loading: false,
          error: event.data.message ?? 'Не удалось построить аппликатуры',
        })
      }
    }
    worker.onerror = () => {
      if (!cancelled) {
        setState({ voicings: [], loading: false, error: 'Ошибка фонового расчёта' })
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
