import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only proxy target for API. In production the app calls `/api` on the same origin.
const API_TARGET =
  process.env.NODE_ENV === 'production'
    ? '/api'
    : (process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080');

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    sourcemap: mode !== 'production',
  },
}))
