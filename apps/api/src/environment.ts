export interface AuthEnvironment {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  WEBHOOK_ENCRYPTION_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  AUTH_ALLOWED_RECIPIENT?: string;
  // Razorpay test mode only; see razorpay.ts. Secrets come from .dev.vars or Wrangler secrets.
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RAZORPAY_PLAN_PRO_MONTHLY_INR?: string;
  RAZORPAY_PLAN_PRO_MONTHLY_USD?: string;
  RAZORPAY_PLAN_PRO_ANNUAL_INR?: string;
  RAZORPAY_PLAN_PRO_ANNUAL_USD?: string;
  AUTH_RATE_LIMIT: RateLimit;
  WRITE_RATE_LIMIT: RateLimit;
  PRIVATE_IP_RATE_LIMIT: RateLimit;
}
