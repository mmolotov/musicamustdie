import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { guitarModule, guitarSpec } from './instruments/guitar'
import { bassModule, bassSpec } from './instruments/bass'
import { replaceInstrument } from './instruments/registry'
import { registerFrettedSpec } from './instruments/fretted'
import { GuitarWorkspace } from './components/GuitarWorkspace'
import { registerInstrumentUi } from './instruments/uiRegistry'
import './styles.css'

// The shared fretted-instrument workspace serves both guitar and bass.
replaceInstrument(guitarModule)
registerFrettedSpec(guitarSpec)
registerInstrumentUi({ instrumentId: 'electric-guitar', Workspace: GuitarWorkspace })

replaceInstrument(bassModule)
registerFrettedSpec(bassSpec)
registerInstrumentUi({ instrumentId: 'bass-guitar', Workspace: GuitarWorkspace })

const root = document.getElementById('root')
if (!root) throw new Error('Application root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
