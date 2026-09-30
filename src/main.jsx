import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import './index.css'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/components.css'
import './styles/mobile.css'
import './styles/print.css'
import './pwa-standalone.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
