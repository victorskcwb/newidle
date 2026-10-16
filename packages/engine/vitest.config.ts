import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The offline-vs-tick statistical test simulates many hours of hunting.
    testTimeout: 120_000,
  },
});
