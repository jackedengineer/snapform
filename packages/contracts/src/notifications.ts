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
