import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    allowOnly: false,
    // Fixtures share the development/production database; avoid unbounded load.
    maxWorkers: 2,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
