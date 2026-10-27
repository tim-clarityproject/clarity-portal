import { defineConfig, build } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// The outside Strategic Alignment Health Check is its own small page
// (health-check.html; vercel.json serves it for /health-check/*). It is built
// in a second, separate pass once the portal's build has finished, into the
// same folder, so the two never share a file: the portal's build is exactly
// what it would be without the Health Check page.
function healthCheckPage() {
  let config
  return {
    name: 'clarity-health-check-page',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      await build({
        configFile: false,
        root: config.root,
        mode: config.mode,
        logLevel: config.logLevel,
        publicDir: false, // the portal's pass has already copied public/
        plugins: [react()],
        build: {
          outDir: config.build.outDir,
          emptyOutDir: false,
          sourcemap: config.build.sourcemap,
          rollupOptions: { input: { healthCheck: resolve(config.root, 'health-check.html') } },
        },
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), healthCheckPage()],
})
