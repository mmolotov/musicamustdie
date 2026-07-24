import type { ComponentType } from 'react'
import type { BuiltScale, HarmonizedDegree, ScaleNote } from '../music/types'
import type { DetailSection, ShareState } from '../hooks/useUrlState'

export interface InstrumentWorkspaceProps {
  scale: BuiltScale
  activeNotes: ScaleNote[]
  harmony: HarmonizedDegree[]
  shareState: ShareState
  section: DetailSection
  settingsOpen: boolean
  onCloseSettings: () => void
}

export interface InstrumentUiModule {
  instrumentId: string
  Workspace: ComponentType<InstrumentWorkspaceProps>
}

const uiModules = new Map<string, InstrumentUiModule>()

export function registerInstrumentUi(module: InstrumentUiModule): void {
  uiModules.set(module.instrumentId, module)
}

export function getInstrumentUi(id: string): InstrumentUiModule | undefined {
  return uiModules.get(id)
}
