import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/** The e2e stack runs on its own ports so it never collides with `pnpm dev`. */
const DB_PORT = 5434;
const API_PORT = 3100;
const WEB_PORT = 5174;
const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: `http://localhost:${WEB_PORT}` },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      command: 'pnpm --filter @valdren/dev-db dev',
      cwd: root,
      port: DB_PORT,
      env: {
        DEV_DB_PORT: String(DB_PORT),
        DEV_DB_DIR: fileURLToPath(new URL('../../tools/dev-db/.pgdata-e2e', import.meta.url)),
      },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @valdren/server start',
      cwd: root,
      url: `http://localhost:${API_PORT}/health`,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL: `postgres://valdren:valdren@localhost:${DB_PORT}/valdren`,
      },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_API_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
