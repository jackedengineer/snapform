import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          DATABASE_URL: '',
          // Production runs the checks; tests opt in and never probe the live site.
          OPERATIONS_ENABLED: '0',
          RESEND_WEBHOOK_SECRET:
            'whsec_MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
        },
      },
    }),
  ],
  test: { include: ['test/**/*.test.ts'], allowOnly: false, maxWorkers: 2 },
});
