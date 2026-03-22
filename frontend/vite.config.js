import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Main bundle includes charts + icons; raise limit to avoid noisy build warnings
  build: {
    chunkSizeWarningLimit: 800,
  },
  server: {
    // Expose dev server to local network (so your phone can access it)
    host: '0.0.0.0',
    port: 5173,
  }
})
