import { z } from 'zod';
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
/** The part of a create or cancel response the API relies on. */
export const createdSubscriptionSchema = z.object({ id: subscriptionIdSchema });
const seconds = z.int().min(1).max(4102444800);
// Razorpay adds fields over time, so only the used subset is strict about types.
const eventSchema = z.object({
  event: z.string().regex(/^[a-z_.]{1,64}$/),
  created_at: seconds,
  payload: z.object({
    subscription: z
      .object({
        entity: z.object({
          id: subscriptionIdSchema,
          plan_id: z.string().max(64),
          customer_id: z.string().max(64).nullish(),
          current_start: seconds.nullish(),
          current_end: seconds.nullish(),
          notes: z
            .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
            .optional(),
        }),
      })
      .optional(),
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
  plans: Record<BillingInterval, Record<BillingCurrency, string>>,
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
