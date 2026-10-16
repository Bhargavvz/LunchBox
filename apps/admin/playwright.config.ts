import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the real Next.js app. The backend API and Firebase Auth REST endpoints are intercepted in
 * e2e/fixtures.ts, so the suite runs in CI without a backend or Google credentials.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm next dev -p 3100',
    url: 'http://localhost:3100/login/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: 'http://api.lunchbox.test',
      NEXT_PUBLIC_WS_URL: 'ws://api.lunchbox.test/ws',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'e2e-key',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-lunchbox',
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR: '',
    },
  },
});
