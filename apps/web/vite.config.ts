import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Unit tests only; `e2e/` needs live servers and runs under Playwright.
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // Every module under src/ counts against the gate, including ones no
      // test imports — the alternative measures only what the suite already
      // reaches. README.md § Coverage explains the exclusion.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx'],
      // Statements and lines only, to gate the same measure the Go side
      // gates; branches would be a stricter bar than 90% was asked to be.
      thresholds: { lines: 90, statements: 90 },
    },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }],
    },
  },
  server: {
    // Bind all interfaces so the server is reachable through the
    // devcontainer's published port, not just from inside the container.
    host: true,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
