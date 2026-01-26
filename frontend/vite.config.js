import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Expose dev server to local network (so your phone can access it)
    host: '0.0.0.0',
    port: 5173,
  }
})
