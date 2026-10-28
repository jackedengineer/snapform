import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'packages/contracts/**/*.test.ts',
      'apps/web/src/features/auth/api.test.ts',
      'apps/web/src/features/workspaces/api.test.ts',
      'apps/web/src/features/forms/api.test.ts',
      'apps/web/src/features/forms/new-form.test.ts',
      'apps/web/src/features/forms/DraftRecovery.test.ts',
      'apps/web/src/features/forms/recover-draft.test.ts',
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
        'packages/contracts/src/answers.ts',
        'packages/contracts/src/rules.ts',
        'packages/contracts/src/compile.ts',
        'packages/contracts/src/evaluate.ts',
        'packages/contracts/src/draft.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
