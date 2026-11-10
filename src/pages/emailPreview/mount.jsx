import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../globalStyles'
import EmailPreview from './EmailPreview'

// Started by src/main.preview.jsx for /email-preview (previews and local
// development only). Renders the email test page on its own: none of the
// portal (sign-in, providers, database) is loaded, and nothing is sent.
document.title = 'Email test page, The Clarity Portal'
const robots = document.createElement('meta')
robots.name = 'robots'
robots.content = 'noindex, nofollow'
document.head.appendChild(robots)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EmailPreview />
  </StrictMode>,
)
