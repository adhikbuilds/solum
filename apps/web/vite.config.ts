import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    host: true,
    port: 5180,
    // The massing service is the only backend. Proxying in dev keeps the browser on one origin,
    // so the production same-origin deployment and local dev behave identically.
    proxy: { '/api': { target: 'http://localhost:8010', changeOrigin: true } },
  },
})
