import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The offline-vs-tick statistical test runs ~40,000 simulated hours.
    testTimeout: 60_000,
  },
});
