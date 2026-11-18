// Every global stylesheet the portal loads, in order. Shared by the app
// (src/main.jsx) and the design gallery (src/pages/designReference), so
// the gallery shows the components under exactly the same global rules.
// DM Sans as Google Fonts serves it, with its optical sizes, from the portal's own files (Phase 8a follow-up, step 1).
import './styles/dm-sans.css'
import './index.css'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/components.css'
import './styles/mobile.css'
// Every button's one look (Tim, 18 Nov), after mobile.css's older phone rule.
import './styles/buttons.css'
import './styles/print.css'
import './pwa-standalone.css'
