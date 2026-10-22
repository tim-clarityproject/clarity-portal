// Entry point on local development and Vercel previews only (see
// vite.config.js); the live site's build never includes this file. It
// opens the design gallery at /design-reference without loading the
// portal at all (no sign-in, no database), and everything else boots the
// normal app from main.jsx exactly as the live site does.
const path = window.location.pathname.replace(/\/+$/, '')

if (path === '/design-reference') {
  import('./pages/designReference/mount.jsx')
} else {
  import('./main.jsx')
}
