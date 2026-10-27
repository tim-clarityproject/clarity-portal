import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
// Two pages: the portal (index.html) and the outside Strategic Alignment
// Health Check (health-check.html), which vercel.json serves for
// /health-check/*.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        healthCheck: resolve(import.meta.dirname, 'health-check.html'),
      },
    },
  },
})
