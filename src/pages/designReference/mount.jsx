import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../globalStyles'
import DesignReference from './DesignReference'
import { keepPlaceOnReveal } from '../../lib/keepPlace'

// Anything that opens on the same page keeps your place (Tim, 13 Nov):
// the gallery starts it too, so its parts behave as they do in the portal.
keepPlaceOnReveal()

// Started by src/main.preview.jsx for /design-reference (previews and
// local development only). Renders the gallery on its own: none of the
// portal (sign-in, providers, database) is loaded.
document.title = 'Clarity Design Reference'
const robots = document.createElement('meta')
robots.name = 'robots'
robots.content = 'noindex, nofollow'
document.head.appendChild(robots)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DesignReference />
  </StrictMode>,
)
