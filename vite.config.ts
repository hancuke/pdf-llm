import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Pure client-side static site. No backend. PDF bytes and conversation
// history never leave the browser (ADR-0001).
export default defineConfig({
  plugins: [vue()],
  // pdfjs-dist ships a prebuilt worker; let Vite handle it as an asset URL.
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
})
