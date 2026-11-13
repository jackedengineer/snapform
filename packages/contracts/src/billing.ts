import { z } from 'zod';
import { roleSchema } from './workspace.ts';
// Browser-facing billing shapes. Server-only projections live in billing-server.ts
// so the browser bundle does not carry provider schemas.
const count = z.int().min(0).max(2147483647);
const instant = z.iso.datetime();
export const intervalSchema = z.enum(['monthly', 'annual']);
export const currencySchema = z.enum(['INR', 'USD']);
export const subscriptionIdSchema = z.string().regex(/^sub_[A-Za-z0-9]{1,40}$/);
export const usageFields = {
  role: roleSchema,
  plan: z.enum(['free', 'pro']),
  status: z.enum([
    'none',
    'created',
    'active',
    'halted',
    'cancelled',
    'completed',
  ]),
  interval: intervalSchema.nullable(),
  currency: currencySchema.nullable(),
  currentPeriodEnd: instant.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  responsesUsed: count,
  responsesReserved: count,
  responseLimit: count,
  liveForms: count,
  liveFormLimit: count.nullable(),
  seatsUsed: count,
  seatLimit: count,
  resetsAt: instant,
};
export const billingSummarySchema = z.strictObject({
  ...usageFields,
  configured: z.boolean(),
  features: z.strictObject({
    branding: z.boolean(),
    uploads: z.boolean(),
    embed: z.boolean(),
    badgeRequired: z.boolean(),
  }),
});
export type BillingSummary = z.infer<typeof billingSummarySchema>;
export const checkoutInputSchema = z.strictObject({
  interval: intervalSchema,
  currency: currencySchema,
});
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
// Test mode only: a live key is never accepted by the browser either.
export const checkoutSchema = z.strictObject({
  key: z.string().regex(/^rzp_test_[A-Za-z0-9]{1,40}$/),
  subscriptionId: subscriptionIdSchema,
});
