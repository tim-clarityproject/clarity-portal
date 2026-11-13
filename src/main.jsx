import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './globalStyles'
import App from './App.jsx'
import { keepPlaceOnReveal } from './lib/keepPlace'

// Anything that opens on the same page keeps your place (Tim, 13 Nov).
keepPlaceOnReveal()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
