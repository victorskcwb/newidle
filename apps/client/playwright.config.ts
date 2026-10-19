import { defineConfig, devices } from '@playwright/test';

/** E2E runs on its own port so it never collides with an open `pnpm dev`. */
const WEB_PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  // The game picks its language from the browser; the tests check Portuguese texts.
  use: { baseURL: `http://localhost:${WEB_PORT}`, locale: 'pt-BR' },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'], locale: 'pt-BR' } }],
  webServer: {
    command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
