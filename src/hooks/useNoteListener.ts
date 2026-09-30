import { useCallback, useEffect, useRef, useState } from 'react'
import { attackRatio, createNoteTracker, type NoteTracker } from '../audio/noteTracker'
import {
  createInstrumentDetector,
  midiFromFreq,
  MIN_CLARITY,
  type InstrumentDetector,
  type InstrumentRange,
  type PitchFrame,
} from '../audio/pitch'
import { usePersistentState } from './usePersistentState'

export type ListenerStatus = 'idle' | 'starting' | 'listening' | 'denied' | 'unsupported' | 'failed'

export interface HeardNote {
  midi: number
  cents: number
  /** `performance.now()` at the moment the note was recognised. */
  at: number
}

/** What the level meter shows; all levels in dBFS. */
export interface MeterReading {
  level: number
  gate: number
  /** Louder than the room — something is being played or said. */
  sounding: boolean
  /** The pitch of that sound, when it has one. */
  heard: { midi: number; cents: number } | null
}

export interface NoteListener {
  status: ListenerStatus
  inputs: MediaDeviceInfo[]
  inputId: string | null
  /** Opens the microphone. Has to be called from a click: browsers insist. */
  start: (range: InstrumentRange) => Promise<boolean>
  stop: () => void
  selectInput: (deviceId: string) => void
  /**
   * Stops listening for a moment. The speakers share a room with the
   * microphone, so a sound the app makes itself would come back as an answer.
   */
  mute: (ms: number) => void
  onNote: (listener: (note: HeardNote) => void) => () => void
  subscribeMeter: (listener: () => void) => () => void
  readMeter: () => MeterReading
}

const INPUT_KEY = 'qfc.neck.input.v1'
const POLL_MS = 20
/** The first stretch of every stream only measures the room. */
const CALIBRATION_SECONDS = 0.7
/** The meter redraws ten times a second, not fifty. */
const POLLS_PER_METER = 5
const ATTACK_WINDOW = 2048
/** `BiquadFilterNode` takes a low-pass Q in decibels; this one is Butterworth. */
const BUTTERWORTH_Q_DB = -3.0103
const SILENCE: MeterReading = { level: -100, gate: -60, sounding: false, heard: null }

interface Rig {
  context: AudioContext
  detector: InstrumentDetector
  input: GainNode
  analyser: AnalyserNode
  rawAnalyser: AnalyserNode
  buffer: Float32Array<ArrayBuffer>
  rawBuffer: Float32Array<ArrayBuffer>
  tracker: NoteTracker
  calibrateUntil: number
  stream: MediaStream | null
  source: MediaStreamAudioSourceNode | null
  timer: number | null
  polls: number
}

const isText = (value: unknown): value is string => typeof value === 'string'

const toDb = (rms: number) => 20 * Math.log10(Math.max(rms, 1e-5))

/**
 * Two taps on the microphone. Pitch is read after a 24 dB/oct low-pass, which
 * is what lets a quiet unplugged electric through; the attack is read from the
 * raw signal, because a pick attack is exactly the highs that filter removes.
 */
function buildRig(context: AudioContext, range: InstrumentRange): Rig {
  const detector = createInstrumentDetector({ sampleRate: context.sampleRate, ...range })
  const analyser = context.createAnalyser()
  analyser.fftSize = detector.sourceSize
  const rawAnalyser = context.createAnalyser()
  rawAnalyser.fftSize = ATTACK_WINDOW

  const input = context.createGain()
  let tail: AudioNode = input
  for (let section = 0; section < 2; section += 1) {
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = detector.lowpassHz
    filter.Q.value = BUTTERWORTH_Q_DB
    tail.connect(filter)
    tail = filter
  }
  tail.connect(analyser)
  input.connect(rawAnalyser)

  // A silent path to the output keeps the graph pulled in every browser
  // without the microphone ever reaching the speakers.
  const silent = context.createGain()
  silent.gain.value = 0
  analyser.connect(silent)
  rawAnalyser.connect(silent)
  silent.connect(context.destination)

  return {
    context,
    detector,
    input,
    analyser,
    rawAnalyser,
    buffer: new Float32Array(detector.sourceSize),
    rawBuffer: new Float32Array(ATTACK_WINDOW),
    tracker: createNoteTracker(),
    calibrateUntil: 0,
    stream: null,
    source: null,
    timer: null,
    polls: 0,
  }
}

function dismantle(rig: Rig): void {
  if (rig.timer !== null) window.clearInterval(rig.timer)
  rig.stream?.getTracks().forEach((track) => track.stop())
  rig.source?.disconnect()
  void rig.context.close()
}

function requestStream(deviceId: string | null): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      // `ideal`, so a saved interface that is unplugged today falls back to
      // the default input instead of failing.
      deviceId: deviceId ? { ideal: deviceId } : undefined,
      // Voice processing is tuned for speech and treats a sustained string as
      // noise to be removed.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  })
}

function isDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  )
}

/**
 * The microphone as a stream of "this note was played" events: the hands-free
 * answer channel of the neck trainer. Nothing leaves the browser — the audio
 * is analysed in place and dropped.
 */
export function useNoteListener(): NoteListener {
  const [status, setStatus] = useState<ListenerStatus>('idle')
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [inputId, setInputId] = useState<string | null>(null)
  const [savedInput, setSavedInput] = usePersistentState<string>(INPUT_KEY, '', isText)
  const rigRef = useRef<Rig | null>(null)
  const aliveRef = useRef(false)
  const deafUntilRef = useRef(0)
  const noteListenersRef = useRef(new Set<(note: HeardNote) => void>())
  const meterListenersRef = useRef(new Set<() => void>())
  const meterRef = useRef<MeterReading>(SILENCE)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const publishMeter = useCallback((frame: PitchFrame, gate: number) => {
    const sounding = frame.rms > gate
    const exact =
      sounding && frame.freq !== null && frame.clarity >= MIN_CLARITY
        ? midiFromFreq(frame.freq)
        : null
    meterRef.current = {
      level: toDb(frame.rms),
      gate: toDb(gate),
      sounding,
      heard:
        exact === null
          ? null
          : { midi: Math.round(exact), cents: Math.round((exact - Math.round(exact)) * 100) },
    }
    meterListenersRef.current.forEach((listener) => listener())
  }, [])

  const poll = useCallback(() => {
    const rig = rigRef.current
    if (!rig) return
    rig.analyser.getFloatTimeDomainData(rig.buffer)
    rig.rawAnalyser.getFloatTimeDomainData(rig.rawBuffer)
    const frame = rig.detector.detect(rig.buffer)
    const time = rig.context.currentTime

    if (time < rig.calibrateUntil) {
      rig.tracker.calibrate(frame.rms)
    } else if (performance.now() >= deafUntilRef.current) {
      const event = rig.tracker.push({ ...frame, time, attack: attackRatio(rig.rawBuffer) })
      if (event) {
        const note: HeardNote = { midi: event.midi, cents: event.cents, at: performance.now() }
        noteListenersRef.current.forEach((listener) => listener(note))
      }
    }

    rig.polls += 1
    if (rig.polls % POLLS_PER_METER === 0) publishMeter(frame, rig.tracker.gate)
  }, [publishMeter])

  const attach = useCallback(async (rig: Rig, deviceId: string | null) => {
    const stream = await requestStream(deviceId)
    rig.stream?.getTracks().forEach((track) => track.stop())
    rig.source?.disconnect()
    rig.stream = stream
    rig.source = rig.context.createMediaStreamSource(stream)
    rig.source.connect(rig.input)
    // Another microphone is another room: its noise is measured afresh.
    rig.tracker = createNoteTracker()
    rig.calibrateUntil = rig.context.currentTime + CALIBRATION_SECONDS

    const devices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devices.filter((device) => device.kind === 'audioinput')
    setInputs(audioInputs)
    // The track usually names its device. When it names none of the listed
    // ones, the device that was asked for is the best answer there is.
    const listed = (id: string | null | undefined): id is string =>
      audioInputs.some((input) => input.deviceId === id)
    const reported = stream.getAudioTracks()[0]?.getSettings().deviceId
    setInputId(listed(reported) ? reported : listed(deviceId) ? deviceId : null)
  }, [])

  const teardown = useCallback(() => {
    const rig = rigRef.current
    rigRef.current = null
    if (rig) dismantle(rig)
    void wakeLockRef.current?.release()
    wakeLockRef.current = null
    meterRef.current = SILENCE
    meterListenersRef.current.forEach((listener) => listener())
  }, [])

  const keepAwake = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // The screen may dim; the session goes on.
    }
  }, [])

  const start = useCallback(
    async (range: InstrumentRange): Promise<boolean> => {
      if (rigRef.current) return true
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
        setStatus('unsupported')
        return false
      }
      setStatus('starting')
      let rig: Rig | null = null
      try {
        const context = new AudioContext({ latencyHint: 'interactive' })
        rig = buildRig(context, range)
        await context.resume()
        await attach(rig, savedInput || null)
        // The player may have left the drill while the permission prompt was up.
        if (!aliveRef.current) {
          dismantle(rig)
          return false
        }
        rig.timer = window.setInterval(poll, POLL_MS)
        rigRef.current = rig
        setStatus('listening')
        void keepAwake()
        return true
      } catch (error) {
        if (rig) dismantle(rig)
        if (aliveRef.current) setStatus(isDenied(error) ? 'denied' : 'failed')
        return false
      }
    },
    [attach, keepAwake, poll, savedInput],
  )

  const stop = useCallback(() => {
    teardown()
    setStatus('idle')
  }, [teardown])

  const selectInput = useCallback(
    (deviceId: string) => {
      setSavedInput(deviceId)
      const rig = rigRef.current
      if (!rig) return
      attach(rig, deviceId).catch(() => {
        teardown()
        setStatus('failed')
      })
    },
    [attach, setSavedInput, teardown],
  )

  const mute = useCallback((ms: number) => {
    deafUntilRef.current = Math.max(deafUntilRef.current, performance.now() + ms)
  }, [])

  const onNote = useCallback((listener: (note: HeardNote) => void) => {
    const listeners = noteListenersRef.current
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const subscribeMeter = useCallback((listener: () => void) => {
    const listeners = meterListenersRef.current
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const readMeter = useCallback(() => meterRef.current, [])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      teardown()
    }
  }, [teardown])

  useEffect(() => {
    if (status !== 'listening') return
    // A wake lock is dropped whenever the tab is hidden; take it back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void keepAwake()
    }
    const onDevices = () => {
      void navigator.mediaDevices.enumerateDevices().then((devices) => {
        setInputs(devices.filter((device) => device.kind === 'audioinput'))
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    navigator.mediaDevices.addEventListener('devicechange', onDevices)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      navigator.mediaDevices.removeEventListener('devicechange', onDevices)
    }
  }, [keepAwake, status])

  return {
    status,
    inputs,
    inputId,
    start,
    stop,
    selectInput,
    mute,
    onNote,
    subscribeMeter,
    readMeter,
  }
}
