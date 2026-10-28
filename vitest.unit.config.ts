import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'packages/contracts/**/*.test.ts',
      'apps/web/src/features/auth/api.test.ts',
    ],
    allowOnly: false,
    coverage: {
      provider: 'v8',
      include: [
        'packages/contracts/src/brief.ts',
        'packages/contracts/src/auth.ts',
        'packages/contracts/src/workspace.ts',
        'packages/contracts/src/text.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
