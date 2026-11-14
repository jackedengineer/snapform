import { z } from './zod.ts';
import { subscriptionIdSchema } from './billing.ts';
import { billingEventSchema } from './billing-server.ts';
import type { BillingEvent } from './billing-server.ts';
import type { BillingCurrency, BillingInterval } from './plans.ts';
// Server-only Razorpay webhook rules. Docs:
// https://razorpay.com/docs/webhooks/validate-test/ (raw-body HMAC-SHA256, hex, event-id dedupe)
// https://razorpay.com/docs/webhooks/subscriptions/ (subscription event payloads)
const maxBody = 65536;
/** Web Crypto's HMAC verify compares in constant time; nothing here compares strings. */
export async function verifyRazorpaySignature(
  body: Uint8Array<ArrayBuffer>,
  signature: string | null,
  secret: string,
) {
  const hex = signature?.toLowerCase() ?? '';
  if (!/^[0-9a-f]{64}$/.test(hex) || !secret || body.byteLength > maxBody)
    return false;
  const digest = new Uint8Array(32);
  for (let index = 0; index < 32; index++)
    digest[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, digest, body);
}
export type RazorpayMode = 'test' | 'live';
export type RazorpayPlans = Record<
  BillingInterval,
  Partial<Record<BillingCurrency, string>>
>;
/** Environment names read by razorpaySettings; values come from Wrangler vars, secrets or .dev.vars. */
export interface RazorpayEnvironment {
  SNAPFORM_ENV?: string;
  RAZORPAY_MODE?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  // Test-mode plans keep their original names; live plans have their own.
  RAZORPAY_PLAN_PRO_MONTHLY_INR?: string;
  RAZORPAY_PLAN_PRO_MONTHLY_USD?: string;
  RAZORPAY_PLAN_PRO_ANNUAL_INR?: string;
  RAZORPAY_PLAN_PRO_ANNUAL_USD?: string;
  RAZORPAY_LIVE_PLAN_PRO_MONTHLY_INR?: string;
  RAZORPAY_LIVE_PLAN_PRO_MONTHLY_USD?: string;
  RAZORPAY_LIVE_PLAN_PRO_ANNUAL_INR?: string;
  RAZORPAY_LIVE_PLAN_PRO_ANNUAL_USD?: string;
}
const keys = {
    test: /^rzp_test_[A-Za-z0-9]{10,30}$/,
    live: /^rzp_live_[A-Za-z0-9]{10,30}$/,
  },
  planId = /^plan_[A-Za-z0-9]{10,30}$/;
/**
 * Razorpay credentials for exactly one explicit mode. Test mode needs an
 * rzp_test_ key; live mode needs an rzp_live_ key and SNAPFORM_ENV=production.
 * Any mismatch gives null (billing "not configured"), never another mode.
 */
export function razorpayCredentials(environment: RazorpayEnvironment) {
  const mode = environment.RAZORPAY_MODE,
    keyId = environment.RAZORPAY_KEY_ID ?? '',
    keySecret = environment.RAZORPAY_KEY_SECRET ?? '';
  if (mode !== 'test' && mode !== 'live') return null;
  if (mode === 'live' && environment.SNAPFORM_ENV !== 'production') return null;
  if (!keys[mode].test(keyId) || keySecret.length < 8) return null;
  return { mode: mode as RazorpayMode, keyId, keySecret };
}
/**
 * Full API configuration: credentials, webhook secret and the current mode's
 * plans. INR plans are required. USD is offered only when both USD plans are
 * set; one USD plan or any malformed plan ID leaves billing unconfigured.
 */
export function razorpaySettings(environment: RazorpayEnvironment) {
  const credentials = razorpayCredentials(environment),
    webhookSecret = environment.RAZORPAY_WEBHOOK_SECRET ?? '';
  if (!credentials || webhookSecret.length < 8) return null;
  const live = credentials.mode === 'live',
    read = (interval: 'MONTHLY' | 'ANNUAL', code: BillingCurrency) =>
      environment[
        `RAZORPAY_${live ? 'LIVE_' : ''}PLAN_PRO_${interval}_${code}`
      ] ?? '';
  const inr = [read('MONTHLY', 'INR'), read('ANNUAL', 'INR')],
    usd = [read('MONTHLY', 'USD'), read('ANNUAL', 'USD')],
    withUsd = usd.every(Boolean);
  if (
    !inr.every((id) => planId.test(id)) ||
    (withUsd ? !usd.every((id) => planId.test(id)) : usd.some(Boolean))
  )
    return null;
  const plans: RazorpayPlans = {
    monthly: { INR: inr[0], ...(withUsd ? { USD: usd[0] } : {}) },
    annual: { INR: inr[1], ...(withUsd ? { USD: usd[1] } : {}) },
  };
  return {
    ...credentials,
    webhookSecret,
    currencies: (withUsd ? ['INR', 'USD'] : ['INR']) as BillingCurrency[],
    plans,
  };
}
export type RazorpayConfig = NonNullable<ReturnType<typeof razorpaySettings>>;
/** The part of a create or cancel response the API relies on. */
export const createdSubscriptionSchema = z.object({ id: subscriptionIdSchema });
const seconds = z.int().check(z.minimum(1), z.maximum(4102444800));
// Razorpay adds fields over time, so only the used subset is strict about types.
const eventSchema = z.object({
  event: z.string().check(z.regex(/^[a-z_.]{1,64}$/)),
  created_at: seconds,
  payload: z.object({
    subscription: z.optional(
      z.object({
        entity: z.object({
          id: subscriptionIdSchema,
          plan_id: z.string().check(z.maxLength(64)),
          customer_id: z.nullish(z.string().check(z.maxLength(64))),
          current_start: z.nullish(seconds),
          current_end: z.nullish(seconds),
          notes: z.optional(
            z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]),
          ),
        }),
      }),
    ),
  }),
});
const at = (value: number | null | undefined) =>
  value ? new Date(value * 1000) : null;
/**
 * Reduces a signature-verified webhook to the fields the database applies.
 * Only Snapform's configured plan IDs produce an interval and currency, and
 * only Snapform-set notes produce a workspace; anything else maps to null.
 */
export function toBillingEvent(
  eventId: string | null,
  raw: unknown,
  plans: RazorpayPlans,
): BillingEvent | null {
  const parsed = eventSchema.safeParse(raw),
    id = billingEventSchema.shape.id.safeParse(eventId);
  if (!parsed.success || !id.success) return null;
  const subscription = parsed.data.payload.subscription?.entity,
    notes = subscription?.notes,
    workspace = z
      .uuid()
      .safeParse(notes && !Array.isArray(notes) ? notes.workspace_id : null),
    customer = billingEventSchema.shape.customerId.safeParse(
      subscription?.customer_id,
    );
  let interval: BillingInterval | null = null,
    currency: BillingCurrency | null = null;
  for (const period of ['monthly', 'annual'] as const)
    for (const code of ['INR', 'USD'] as const)
      if (subscription && plans[period][code] === subscription.plan_id) {
        interval = period;
        currency = code;
      }
  return {
    id: id.data,
    type: parsed.data.event,
    createdAt: new Date(parsed.data.created_at * 1000),
    workspaceId: workspace.success ? workspace.data : null,
    subscriptionId: subscription?.id ?? null,
    customerId: customer.success ? customer.data : null,
    interval,
    currency,
    periodStart: at(subscription?.current_start),
    periodEnd: at(subscription?.current_end),
  };
}
