import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const backend = fileURLToPath(new URL('../medicinebackend', import.meta.url))
const useChrome = existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:15173',
    channel: useChrome ? 'chrome' : undefined,
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    contextOptions: { reducedMotion: 'reduce' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: '.venv/bin/python -m scripts.e2e_server',
      cwd: backend,
      port: 18001,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --port 15173',
      env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:18001' },
      port: 15173,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
