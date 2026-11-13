import { z } from 'zod';
import { features } from './plans.ts';
import {
  billingSummarySchema,
  currencySchema,
  intervalSchema,
  subscriptionIdSchema,
  usageFields,
} from './billing.ts';
import type { BillingSummary } from './billing.ts';
// What public.workspace_billing returns for a member of the scoped workspace.
export const billingRecordSchema = z.strictObject({
  ...usageFields,
  checkoutSubscription: subscriptionIdSchema.nullable(),
});
export type BillingRecord = z.infer<typeof billingRecordSchema>;
/** The member-visible projection; provider identifiers never leave the API. */
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
