import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:26626',
      '/dav': 'http://127.0.0.1:26626',
      '/health': 'http://127.0.0.1:26626',
    },
  },
})
