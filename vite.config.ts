/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' => las rutas de assets son relativas. Imprescindible para GitHub Pages, que sirve el
// sitio en un subdirectorio (/memory-task/). Es seguro porque el router usa hash (#/ruta).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    css: false,
  },
})
