import { defineConfig, devices } from '@playwright/test'

// Runs against the dev servers already started in the devcontainer
// (`pnpm dev`): web on :5173, proxying /api to the Go server on :8080.
const ci = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  // HTML report + recordings in CI; local runs stay quiet.
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: ci ? 'retain-on-failure' : 'off',
    video: ci ? 'on' : 'off',
    screenshot: ci ? 'only-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
