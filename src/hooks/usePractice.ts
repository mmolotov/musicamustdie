import { useCallback, useEffect, useRef, useState } from 'react'
import { initialPracticeState, practiceReducer } from '../practice/machine'
import type { PracticeAction, PracticeState, StepOutcome } from '../practice/types'

/** How long the needle takes to settle, in step with the CSS transition. */
export const SPIN_MS = 1200

export interface PracticeControls {
  state: PracticeState
  spin: () => void
  /** Stops the needle early — the wheel is fun exactly twice. */
  landNeedle: () => void
  /** Shows the answer without grading it, for the self-checked steps. */
  reveal: () => void
  answer: (outcome: StepOutcome) => void
  next: () => void
}

function readSeed(): number {
  try {
    const raw = new URLSearchParams(window.location.search).get('seed')
    const parsed = Number(raw)
    if (raw !== null && raw.trim() !== '' && Number.isFinite(parsed)) return parsed
  } catch {
    /* ignore malformed query strings */
  }
  return Date.now()
}

function spinDuration(): number {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SPIN_MS
  } catch {
    return SPIN_MS
  }
}

export function usePractice(): PracticeControls {
  const [state, setState] = useState<PracticeState>(() => initialPracticeState(readSeed()))
  const spinTimer = useRef<number | null>(null)

  const dispatch = useCallback((action: PracticeAction) => {
    setState((current) => practiceReducer(current, action))
  }, [])

  const clearSpinTimer = useCallback(() => {
    if (spinTimer.current === null) return
    window.clearTimeout(spinTimer.current)
    spinTimer.current = null
  }, [])

  const landNeedle = useCallback(() => {
    clearSpinTimer()
    dispatch({ type: 'spinEnded' })
  }, [clearSpinTimer, dispatch])

  const spin = useCallback(() => {
    clearSpinTimer()
    dispatch({ type: 'spin' })
    spinTimer.current = window.setTimeout(landNeedle, spinDuration())
  }, [clearSpinTimer, dispatch, landNeedle])

  useEffect(() => clearSpinTimer, [clearSpinTimer])

  const reveal = useCallback(() => dispatch({ type: 'reveal' }), [dispatch])
  const answer = useCallback(
    (outcome: StepOutcome) => dispatch({ type: 'answer', outcome }),
    [dispatch],
  )
  const next = useCallback(() => dispatch({ type: 'next' }), [dispatch])

  return { state, spin, landNeedle, reveal, answer, next }
}
