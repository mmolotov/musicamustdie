import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  AccidentalPreference,
  KeySelection,
  MinorVariant,
  Mode,
  ScaleDirection,
} from '../music/types'

export type DetailSection = 'notes' | 'scales' | 'chords'

export interface ShareState {
  instrument: string
  selection: KeySelection
  minorVariant: MinorVariant
  direction: ScaleDirection
  section: DetailSection
  practice: boolean
}

const DEFAULT_SHARE_STATE: ShareState = {
  instrument: 'electric-guitar',
  selection: { tonic: 0, mode: 'major', spelling: 'sharp' },
  minorVariant: 'natural',
  direction: 'ascending',
  section: 'notes',
  practice: false,
}

function oneOf<T extends string>(value: string | null, choices: readonly T[], fallback: T): T {
  return value !== null && choices.includes(value as T) ? (value as T) : fallback
}

function readUrlState(): ShareState {
  const params = new URLSearchParams(window.location.search)
  const tonicValue = Number(params.get('tonic'))
  const tonic = Number.isInteger(tonicValue) && tonicValue >= 0 && tonicValue <= 11 ? tonicValue : 0
  const mode = oneOf<Mode>(params.get('mode'), ['major', 'minor'], 'major')
  const spelling = oneOf<AccidentalPreference>(
    params.get('spelling'),
    ['sharp', 'flat'],
    'sharp',
  )
  return {
    instrument: params.get('instrument') || DEFAULT_SHARE_STATE.instrument,
    selection: { tonic, mode, spelling },
    minorVariant: oneOf<MinorVariant>(
      params.get('minorVariant'),
      ['natural', 'harmonic', 'melodic-classical', 'melodic-jazz'],
      'natural',
    ),
    direction: oneOf<ScaleDirection>(
      params.get('direction'),
      ['ascending', 'descending'],
      'ascending',
    ),
    section: oneOf<DetailSection>(
      params.get('section'),
      ['notes', 'scales', 'chords'],
      'notes',
    ),
    practice: params.get('practice') === '1',
  }
}

function writeUrlState(state: ShareState): void {
  const params = new URLSearchParams()
  params.set('instrument', state.instrument)
  if (state.practice) {
    // The drilled key is drawn by the wheel, so publishing it here would be
    // stale at best and a peek at the answer at worst. Only the mode, the
    // minor variant being drilled, and the draw seed survive a reload.
    params.set('practice', '1')
    params.set('minorVariant', state.minorVariant)
    const seed = new URLSearchParams(window.location.search).get('seed')
    if (seed) params.set('seed', seed)
  } else {
    params.set('tonic', String(state.selection.tonic))
    params.set('mode', state.selection.mode)
    params.set('spelling', state.selection.spelling)
    if (state.selection.mode === 'minor') params.set('minorVariant', state.minorVariant)
    if (state.minorVariant === 'melodic-classical') params.set('direction', state.direction)
    params.set('section', state.section)
  }
  const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
  window.history.replaceState(null, '', nextUrl)
}

export function useUrlState(): [ShareState, Dispatch<SetStateAction<ShareState>>] {
  const [state, setState] = useState<ShareState>(readUrlState)

  useEffect(() => {
    writeUrlState(state)
  }, [state])

  useEffect(() => {
    const handlePopState = () => setState(readUrlState())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return [state, setState]
}
