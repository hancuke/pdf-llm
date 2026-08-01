import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Pure client-side static site. No backend. PDF bytes and conversation
// history never leave the browser (ADR-0001).
export default defineConfig({
  plugins: [vue()],
  // Exclude the PDFium package from esbuild pre-bundling: it references its own
  // .wasm and pre-bundling can break that resolution.
  optimizeDeps: {
    exclude: ['@embedpdf/pdfium'],
  },
  // Edge TTS WebSocket proxy. The browser cannot set the `Origin`/`User-Agent`
  // headers Microsoft's endpoint requires, so a direct `WebSocket` from the
  // page is rejected. This dev proxy relays the upgrade and injects them
  // (mirrors the MsEdge-TTS-Extension Cloudflare Worker). Used when the TTS
  // proxy setting is left empty. For production builds, deploy a similar proxy
  // and set the proxy URL in settings.
  server: {
    proxy: {
      '/edge-tts-ws': {
        target:
          'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1',
        ws: true,
        changeOrigin: true,
        headers: {
          Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        },
        rewrite: (path) => path.replace(/^\/edge-tts-ws/, ''),
      },
    },
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
