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
          ...(process.env.DATABASE_URL
            ? { DATABASE_URL: process.env.DATABASE_URL }
            : {}),
          ...(process.env.BETTER_AUTH_SECRET
            ? { BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET }
            : {}),
          AUTH_ALLOWED_RECIPIENT: 'approved@example.invalid',
          RESEND_API_KEY: 'no-live-email-in-tests',
          BETTER_AUTH_URL: 'http://127.0.0.1:5173',
        },
      },
    }),
  ],
  test: { include: ['test/**/*.test.ts'], allowOnly: false },
});
