import { z } from './zod.ts';
const count = (max: number) => z.int().check(z.minimum(0), z.maximum(max));
export const emailSettingsInputSchema = z.strictObject({
  enabled: z.boolean(),
  expectedRevision: count(2147483646),
});
export type EmailSettingsInput = z.infer<typeof emailSettingsInputSchema>;
export const emailRetryInputSchema = z.strictObject({
  deliveryId: z.uuid(),
  expectedAttempts: count(7),
});
export type EmailRetryInput = z.infer<typeof emailRetryInputSchema>;
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
    revision: count(2147483647),
  })
  .check(
    z.refine(
      (value) => value.revision > 0 || !value.enabled,
      'Enabled notifications require a saved revision.',
    ),
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
        attempts: count(8),
        retryable: z.boolean(),
        reason: z.nullable(
          z.enum([
            'disabled',
            'recipient-unavailable',
            'configuration',
            'provider-rejected',
            'idempotency-expired',
            'attempts-exhausted',
          ]),
        ),
        createdAt: z.iso.datetime(),
      }),
    )
    .check(z.maxLength(20)),
});
export type EmailOverview = z.infer<typeof emailOverviewSchema>;
