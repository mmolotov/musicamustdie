import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { guitarModule } from './instruments/guitar'
import { replaceInstrument } from './instruments/registry'
import { GuitarWorkspace } from './components/GuitarWorkspace'
import { registerInstrumentUi } from './instruments/uiRegistry'
import './styles.css'

replaceInstrument(guitarModule)
registerInstrumentUi({ instrumentId: 'electric-guitar', Workspace: GuitarWorkspace })

const root = document.getElementById('root')
if (!root) throw new Error('Application root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
