import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { guitarModule, guitarSpec } from './instruments/guitar'
import { bassModule, bassSpec } from './instruments/bass'
import { replaceInstrument } from './instruments/registry'
import { registerFrettedSpec } from './instruments/fretted'
import { GuitarWorkspace } from './components/GuitarWorkspace'
import { NeckTrainer } from './components/NeckTrainer'
import { registerInstrumentUi } from './instruments/uiRegistry'
import './styles.css'

// The shared fretted-instrument workspace and neck trainer serve both guitar
// and bass.
replaceInstrument(guitarModule)
registerFrettedSpec(guitarSpec)
registerInstrumentUi({ instrumentId: 'electric-guitar', Workspace: GuitarWorkspace, NeckTrainer })

replaceInstrument(bassModule)
registerFrettedSpec(bassSpec)
registerInstrumentUi({ instrumentId: 'bass-guitar', Workspace: GuitarWorkspace, NeckTrainer })

const root = document.getElementById('root')
if (!root) throw new Error('Application root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
