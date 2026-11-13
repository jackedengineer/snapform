import { z } from 'zod';
import { roleSchema } from './workspace.ts';
import { features } from './plans.ts';

const count = z.int().min(0).max(2147483647);
const instant = z.iso.datetime();
export const intervalSchema = z.enum(['monthly', 'annual']);
export const currencySchema = z.enum(['INR', 'USD']);
export const subscriptionIdSchema = z.string().regex(/^sub_[A-Za-z0-9]{1,40}$/);
// What public.workspace_billing returns for a member of the scoped workspace.
export const billingRecordSchema = z.strictObject({
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
  checkoutSubscription: subscriptionIdSchema.nullable(),
  responsesUsed: count,
  responsesReserved: count,
  responseLimit: count,
  liveForms: count,
  liveFormLimit: count.nullable(),
  seatsUsed: count,
  seatLimit: count,
  resetsAt: instant,
});
export type BillingRecord = z.infer<typeof billingRecordSchema>;
export const billingSummarySchema = billingRecordSchema
  .omit({ checkoutSubscription: true })
  .extend({
    configured: z.boolean(),
    features: z.strictObject({
      branding: z.boolean(),
      uploads: z.boolean(),
      embed: z.boolean(),
      badgeRequired: z.boolean(),
    }),
  });
export type BillingSummary = z.infer<typeof billingSummarySchema>;
/** The owner-visible projection; provider identifiers never leave the API. */
export function billingSummary(
  record: BillingRecord,
  configured: boolean,
): BillingSummary {
  const summary: Record<string, unknown> = {
    ...record,
    configured,
    features: features(record.plan),
  };
  delete summary.checkoutSubscription;
  return billingSummarySchema.parse(summary);
}
// A verified provider event, reduced to the fields public.apply_billing_event uses.
export const billingEventSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_]{1,64}$/),
  type: z.string().regex(/^[a-z_.]{1,64}$/),
  createdAt: z.date(),
  workspaceId: z.uuid().nullable(),
  subscriptionId: subscriptionIdSchema.nullable(),
  customerId: z
    .string()
    .regex(/^cust_[A-Za-z0-9]{1,40}$/)
    .nullable(),
  interval: intervalSchema.nullable(),
  currency: currencySchema.nullable(),
  periodStart: z.date().nullable(),
  periodEnd: z.date().nullable(),
});
export type BillingEvent = z.infer<typeof billingEventSchema>;
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
