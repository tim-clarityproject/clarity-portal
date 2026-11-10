// Entry point on local development and Vercel previews only (see
// vite.config.js); the live site's build never includes this file. It
// opens the design gallery at /design-reference and the email test page at
// /email-preview without loading the portal at all (no sign-in, no
// database), and everything else boots the
// normal app from main.jsx exactly as the live site does.
const path = window.location.pathname.replace(/\/+$/, '')

if (path === '/design-reference') {
  import('./pages/designReference/mount.jsx')
} else if (path === '/email-preview') {
  // The hidden email test page (Tim, 10 Nov): every email with invented
  // people. Nothing links to it.
  import('./pages/emailPreview/mount.jsx')
} else {
  import('./main.jsx')
}
