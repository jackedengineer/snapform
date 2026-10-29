import { z } from 'zod';
export const emailSettingsInputSchema = z.strictObject({
  enabled: z.boolean(),
  expectedRevision: z.int().min(0).max(2147483646),
});
export type EmailSettingsInput = z.infer<typeof emailSettingsInputSchema>;
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
  'cancelled',
  'needs_action',
] as const;
