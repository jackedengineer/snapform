import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'packages/contracts/**/*.test.ts',
      'apps/web/src/*.test.ts',
      'apps/web/src/features/auth/api.test.ts',
      'apps/web/src/features/workspaces/api.test.ts',
      'apps/web/src/features/forms/*.test.ts',
      'apps/web/src/features/intake/*.test.ts',
    ],
    allowOnly: false,
    coverage: {
      provider: 'v8',
      include: [
        'packages/contracts/src/brief.ts',
        'packages/contracts/src/auth.ts',
        'packages/contracts/src/workspace.ts',
        'packages/contracts/src/text.ts',
        'packages/contracts/src/form.ts',
        'packages/contracts/src/currency.ts',
        'packages/contracts/src/answers.ts',
        'packages/contracts/src/rules.ts',
        'packages/contracts/src/compile.ts',
        'packages/contracts/src/evaluate.ts',
        'packages/contracts/src/draft.ts',
        'packages/contracts/src/intake-progress.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
