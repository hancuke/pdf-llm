import { defineConfig, devices } from '@playwright/test'

// Browser end-to-end tests. Spins up the Vite dev server, then drives the real
// app in Chromium. Run with: npm run test:e2e
//
// Note: the PdfViewer's selection→Context mapping is the one path the spec
// marks manual-only; here we still cover it in-browser because E2E is the only
// layer that can exercise real pdf.js text-layer selection.

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
