import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The design gallery (/design-reference) exists only in local development
// and on Vercel preview deployments, never on the live site. Vercel sets
// VERCEL_ENV to 'production' when it builds the live site and 'preview'
// for branch builds. When the gallery is on, index.html loads
// src/main.preview.jsx instead of src/main.jsx; otherwise the build never
// sees the gallery's code at all.
//
// The colour mode (Light, Dark or Match my device) must be set before the
// first paint, so src/lib/colourMode/boot.js is inlined into <head>. In
// Phase 0b it runs on the gallery only, so no existing page changes; Phase
// 0c drops the path check and adds it to every build.
const colourModeBoot = readFileSync(new URL('./src/lib/colourMode/boot.js', import.meta.url), 'utf8')

function designGallery(enabled) {
  return {
    name: 'clarity-design-gallery',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!enabled) return html
        return {
          html: html.replace('/src/main.jsx', '/src/main.preview.jsx'),
          tags: [
            {
              tag: 'script',
              injectTo: 'head',
              children: `if (location.pathname.replace(/\\/+$/, '') === '/design-reference') {\n${colourModeBoot}\n}`,
            },
          ],
        }
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const galleryEnabled = command === 'serve' || process.env.VERCEL_ENV === 'preview'
  return {
    plugins: [react(), designGallery(galleryEnabled)],
  }
})
