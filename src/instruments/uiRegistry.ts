import type { ComponentType } from 'react'
import type { BuiltScale, HarmonizedDegree, ScaleNote } from '../music/types'
import type { DetailSection, ShareState } from '../hooks/useUrlState'
import type { PracticeStepId } from '../practice/types'

/**
 * What practice asks the instrument for. The fingering library and the chord
 * shapes live in the instrument module, so the round hands over the draw and
 * lets the instrument resolve it into a concrete assignment.
 */
export interface PracticeDelegate {
  step: PracticeStepId
  /** Deterministic pick for this round, in [0, 1). */
  pick: number
  /** Second pick, for the box the pentatonic step assigns. */
  pentatonicPick: number
  /** 1-based scale degree the chord step asks about. */
  chordDegree: number
  revealed: boolean
}

export interface InstrumentWorkspaceProps {
  scale: BuiltScale
  activeNotes: ScaleNote[]
  harmony: HarmonizedDegree[]
  shareState: ShareState
  section: DetailSection
  settingsOpen: boolean
  onCloseSettings: () => void
  practice?: PracticeDelegate
}

/**
 * The neck drill is about the instrument and not about a key, so it gets none
 * of the workspace's scale props — only what it needs to find its own
 * preferences and to share the settings dialog.
 */
export interface NeckTrainerProps {
  instrumentId: string
  /** Deal seed; see `readSeed`. */
  seed: number
  settingsOpen: boolean
  onCloseSettings: () => void
}

export interface InstrumentUiModule {
  instrumentId: string
  Workspace: ComponentType<InstrumentWorkspaceProps>
  /** Absent for instruments that have no neck to learn. */
  NeckTrainer?: ComponentType<NeckTrainerProps>
}

const uiModules = new Map<string, InstrumentUiModule>()

export function registerInstrumentUi(module: InstrumentUiModule): void {
  uiModules.set(module.instrumentId, module)
}

export function getInstrumentUi(id: string): InstrumentUiModule | undefined {
  return uiModules.get(id)
}
