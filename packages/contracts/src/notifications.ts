import { z } from 'zod';
export const emailSettingsInputSchema = z.strictObject({
  enabled: z.boolean(),
  expectedRevision: z.int().min(0).max(2147483646),
});
export type EmailSettingsInput = z.infer<typeof emailSettingsInputSchema>;
export type EmailOutcome =
  | { status: 'accepted'; providerId: string }
  | { status: 'retry'; reason: 'provider-unavailable'; delaySeconds: number }
  | {
      status: 'needs_action';
      reason: 'configuration' | 'provider-rejected' | 'idempotency-expired';
    };
export const emailSettingsSchema = z
  .strictObject({
    enabled: z.boolean(),
    revision: z.int().min(0).max(2147483647),
  })
  .refine(
    (value) => value.revision > 0 || !value.enabled,
    'Enabled notifications require a saved revision.',
  );
export const emailDeliveryStates = [
  'pending',
  'sending',
  'accepted',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'suppressed',
  'cancelled',
  'needs_action',
] as const;
export const emailOverviewSchema = z.strictObject({
  settings: emailSettingsSchema,
  deliveries: z
    .array(
      z.strictObject({
        id: z.uuid(),
        responseId: z.uuid(),
        status: z.enum(emailDeliveryStates),
        attempts: z.int().min(0).max(8),
        reason: z
          .enum([
            'disabled',
            'recipient-unavailable',
            'configuration',
            'provider-rejected',
            'idempotency-expired',
            'attempts-exhausted',
          ])
          .nullable(),
        createdAt: z.iso.datetime(),
      }),
    )
    .max(20),
});
export type EmailOverview = z.infer<typeof emailOverviewSchema>;
