import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './globalStyles'
import App from './App.jsx'
import { keepPlaceOnReveal } from './lib/keepPlace'
import { startOpeningReads } from './lib/performance/pageReads'

// A client page's reads go out now, before its own code has arrived (the
// scale check, fixer C): its loaders make the same reads and get these
// answers (readShare.js) instead of waiting a round trip more.
startOpeningReads()

// Anything that opens on the same page keeps your place (Tim, 13 Nov).
keepPlaceOnReveal()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
