import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use relative base so Electron can load dist via file://
  base: './',
  resolve: {
    dedupe: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/search',
      '@codemirror/theme-one-dark',
      '@codemirror/lang-html',
      '@codemirror/lang-css',
      '@codemirror/lang-javascript',
      '@codemirror/lang-java',
      '@codemirror/lang-cpp',
    ],
  },
  optimizeDeps: {
    include: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/search',
      '@codemirror/theme-one-dark',
      '@codemirror/lang-html',
      '@codemirror/lang-css',
      '@codemirror/lang-javascript',
      '@codemirror/lang-java',
      '@codemirror/lang-cpp',
    ],
  },
  server: {
    port: 5590,
    strictPort: true
  },
  build: {
    outDir: 'dist'
  },
  preview: {
    port: 5590,
    strictPort: true
  }
})
