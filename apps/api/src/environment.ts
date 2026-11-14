import type { RazorpayEnvironment } from '@snapform/contracts/razorpay';
// Razorpay names (mode, keys, per-mode plans) are in RazorpayEnvironment; see docs/runbooks/billing.md.
export interface AuthEnvironment extends RazorpayEnvironment {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  WEBHOOK_ENCRYPTION_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  AUTH_ALLOWED_RECIPIENT?: string;
  AUTH_RATE_LIMIT: RateLimit;
  WRITE_RATE_LIMIT: RateLimit;
  PRIVATE_IP_RATE_LIMIT: RateLimit;
}
