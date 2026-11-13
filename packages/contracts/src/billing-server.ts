import { z } from './zod.ts';
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
  subscriptionId: z.nullable(subscriptionIdSchema),
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
  delete summary.subscriptionId;
  return billingSummarySchema.parse(summary);
}
// A verified provider event, reduced to the fields public.apply_billing_event uses.
export const billingEventSchema = z.strictObject({
  id: z.string().check(z.regex(/^[A-Za-z0-9_-]{1,64}$/)),
  type: z.string().check(z.regex(/^[a-z_.]{1,64}$/)),
  createdAt: z.date(),
  workspaceId: z.nullable(z.uuid()),
  subscriptionId: z.nullable(subscriptionIdSchema),
  customerId: z.nullable(z.string().check(z.regex(/^cust_[A-Za-z0-9]{1,40}$/))),
  interval: z.nullable(intervalSchema),
  currency: z.nullable(currencySchema),
  periodStart: z.nullable(z.date()),
  periodEnd: z.nullable(z.date()),
});
export type BillingEvent = z.infer<typeof billingEventSchema>;
