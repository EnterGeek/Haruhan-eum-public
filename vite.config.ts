import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        work02Lab: resolve(__dirname, 'work02-lab.html'),
        work02ColorDimensionsLab: resolve(__dirname, 'work02-color-dimensions-lab.html'),
        work03Lab: resolve(__dirname, 'work03-lab.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
})
