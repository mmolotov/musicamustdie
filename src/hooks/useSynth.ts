import { useCallback, useEffect, useRef } from 'react'
import type { PlayableEvent } from '../instruments/types'

interface SynthControls {
  supported: boolean
  playMidi: (midi: number, volume: number) => void
  playEvents: (events: PlayableEvent[], tempo: number, volume: number) => void
  stop: () => void
}

function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function useSynth(): SynthControls {
  const contextRef = useRef<AudioContext | null>(null)
  const sourcesRef = useRef<OscillatorNode[]>([])
  const supported = typeof window !== 'undefined' && Boolean(window.AudioContext)

  const getContext = useCallback((): AudioContext | null => {
    if (!supported) return null
    if (!contextRef.current) contextRef.current = new AudioContext()
    if (contextRef.current.state === 'suspended') void contextRef.current.resume()
    return contextRef.current
  }, [supported])

  const stop = useCallback(() => {
    sourcesRef.current.forEach((source) => {
      try {
        source.stop()
      } catch {
        // The oscillator may already have finished naturally.
      }
    })
    sourcesRef.current = []
  }, [])

  const scheduleNote = useCallback(
    (midi: number, startSeconds: number, durationSeconds: number, volume: number) => {
      const context = getContext()
      if (!context) return
      const oscillator = context.createOscillator()
      const overtone = context.createOscillator()
      const toneGain = context.createGain()
      const overtoneGain = context.createGain()
      const filter = context.createBiquadFilter()
      const destination = context.createGain()
      const startAt = context.currentTime + Math.max(0.01, startSeconds)
      const stopAt = startAt + Math.max(0.12, durationSeconds)
      const safeVolume = Math.max(0.01, Math.min(1, volume))

      oscillator.type = 'triangle'
      oscillator.frequency.value = midiFrequency(midi)
      overtone.type = 'sine'
      overtone.frequency.value = midiFrequency(midi) * 2
      filter.type = 'lowpass'
      filter.frequency.value = 2800
      filter.Q.value = 1.2
      toneGain.gain.setValueAtTime(safeVolume * 0.22, startAt)
      toneGain.gain.exponentialRampToValueAtTime(0.0001, stopAt)
      overtoneGain.gain.setValueAtTime(safeVolume * 0.05, startAt)
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, stopAt * 0.97)
      destination.gain.value = 0.9

      oscillator.connect(toneGain).connect(filter)
      overtone.connect(overtoneGain).connect(filter)
      filter.connect(destination).connect(context.destination)
      oscillator.start(startAt)
      overtone.start(startAt)
      oscillator.stop(stopAt)
      overtone.stop(stopAt)
      sourcesRef.current.push(oscillator, overtone)
      oscillator.addEventListener('ended', () => {
        sourcesRef.current = sourcesRef.current.filter(
          (source) => source !== oscillator && source !== overtone,
        )
      })
    },
    [getContext],
  )

  const playMidi = useCallback(
    (midi: number, volume: number) => {
      stop()
      scheduleNote(midi, 0, 1.15, volume)
    },
    [scheduleNote, stop],
  )

  const playEvents = useCallback(
    (events: PlayableEvent[], tempo: number, volume: number) => {
      stop()
      const beatDuration = 60 / Math.max(40, Math.min(240, tempo))
      events.forEach((event) => {
        scheduleNote(
          event.midi,
          event.startBeat * beatDuration,
          event.durationBeats * beatDuration,
          volume,
        )
      })
    },
    [scheduleNote, stop],
  )

  useEffect(() => {
    return () => {
      stop()
      if (contextRef.current) void contextRef.current.close()
    }
  }, [stop])

  return { supported, playMidi, playEvents, stop }
}
