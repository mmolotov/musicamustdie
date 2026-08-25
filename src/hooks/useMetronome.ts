import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A click track for the fretboard step.
 *
 * It cannot ride on `useSynth`: both `playMidi` and `playEvents` begin with
 * `stop()`, so a metronome built on them would silence itself on every beat
 * and die the moment the reference scale plays. This keeps its own context and
 * schedules ahead of the audio clock — `setInterval` alone drifts audibly.
 */
const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_SECONDS = 0.12
const BEATS_PER_BAR = 4

export interface MetronomeControls {
  supported: boolean
  running: boolean
  start: (tempo: number, volume: number) => void
  stop: () => void
}

export function useMetronome(): MetronomeControls {
  const contextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const nextBeatTimeRef = useRef(0)
  const beatRef = useRef(0)
  const [running, setRunning] = useState(false)
  const supported = typeof window !== 'undefined' && Boolean(window.AudioContext)

  const click = useCallback((context: AudioContext, at: number, accent: boolean, volume: number) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const level = Math.max(0.01, Math.min(1, volume)) * (accent ? 0.5 : 0.32)
    oscillator.type = 'square'
    oscillator.frequency.value = accent ? 1600 : 900
    gain.gain.setValueAtTime(level, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(at)
    oscillator.stop(at + 0.06)
  }, [])

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRunning(false)
  }, [])

  const start = useCallback(
    (tempo: number, volume: number) => {
      if (!supported) return
      if (!contextRef.current) contextRef.current = new AudioContext()
      const context = contextRef.current
      if (context.state === 'suspended') void context.resume()

      stop()
      const beatDuration = 60 / Math.max(40, Math.min(240, tempo))
      beatRef.current = 0
      nextBeatTimeRef.current = context.currentTime + 0.08

      timerRef.current = window.setInterval(() => {
        // A backgrounded tab throttles the timer. Resync rather than fire the
        // whole backlog of missed beats at once when it comes back.
        if (nextBeatTimeRef.current < context.currentTime) {
          nextBeatTimeRef.current = context.currentTime + 0.05
        }
        while (nextBeatTimeRef.current < context.currentTime + SCHEDULE_AHEAD_SECONDS) {
          click(context, nextBeatTimeRef.current, beatRef.current % BEATS_PER_BAR === 0, volume)
          nextBeatTimeRef.current += beatDuration
          beatRef.current += 1
        }
      }, LOOKAHEAD_MS)
      setRunning(true)
    },
    [click, stop, supported],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      if (contextRef.current) void contextRef.current.close()
    }
  }, [])

  return { supported, running, start, stop }
}
