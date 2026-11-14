import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        serviceBindings: {
          JOBS: async (request) =>
            new Response(
              JSON.stringify({
                body: await request.text(),
                signature: request.headers.get('svix-signature'),
              }),
              { headers: { 'Content-Type': 'application/json' } },
            ),
        },
        bindings: {
          ...(process.env.DATABASE_URL
            ? { DATABASE_URL: process.env.DATABASE_URL }
            : {}),
          ...(process.env.BETTER_AUTH_SECRET
            ? { BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET }
            : {}),
          SNAPFORM_ENV: 'production',
          AUTH_ALLOWED_RECIPIENT: 'approved@example.invalid',
          RESEND_API_KEY: 'no-live-email-in-tests',
          TURNSTILE_SITE_KEY: '',
          TURNSTILE_SECRET_KEY: '',
          BETTER_AUTH_URL: 'http://127.0.0.1:5173',
          // Synthetic Razorpay test-mode settings; no request reaches Razorpay.
          // They override the production RAZORPAY_MODE and live plans in wrangler.jsonc.
          RAZORPAY_MODE: 'test',
          RAZORPAY_KEY_ID: 'rzp_test_SyntheticKey01',
          RAZORPAY_KEY_SECRET: 'synthetic-test-secret',
          RAZORPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret',
          RAZORPAY_PLAN_PRO_MONTHLY_INR: 'plan_SyntheticMonINR',
          RAZORPAY_PLAN_PRO_MONTHLY_USD: 'plan_SyntheticMonUSD',
          RAZORPAY_PLAN_PRO_ANNUAL_INR: 'plan_SyntheticAnnINR',
          RAZORPAY_PLAN_PRO_ANNUAL_USD: 'plan_SyntheticAnnUSD',
        },
      },
    }),
  ],
  // Live Neon lifecycle fixtures share the sole development/production database.
  test: { include: ['test/**/*.test.ts'], allowOnly: false, maxWorkers: 1 },
});
