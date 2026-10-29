import { z } from 'zod';
import { parseWebhookTarget } from './webhook-target.ts';
export const webhookConfigurationInputSchema = z.strictObject({
  configurationId: z.uuid().transform((value) => value.toLowerCase()),
  expectedRevision: z.int().min(0).max(2147483646),
  url: z
    .string()
    .max(2048)
    .transform((value, context) => {
      try {
        return parseWebhookTarget(value);
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'Use a public HTTPS endpoint on port 443.',
        });
        return z.NEVER;
      }
    }),
});
export type WebhookConfigurationInput = z.infer<
  typeof webhookConfigurationInputSchema
>;
export const webhookSettingsSchema = z
  .strictObject({
    enabled: z.boolean(),
    revision: z.int().min(0).max(2147483647),
    configurationId: z.uuid().nullable(),
    url: z.string().max(2048).nullable(),
    verifiedAt: z.iso.datetime().nullable(),
  })
  .refine((value) =>
    value.revision === 0
      ? !value.enabled &&
        value.configurationId === null &&
        value.url === null &&
        value.verifiedAt === null
      : value.configurationId !== null &&
        value.url !== null &&
        (!value.enabled || value.verifiedAt !== null),
  );
export const webhookSecretInputSchema = z.strictObject({
  configurationId: webhookConfigurationInputSchema.shape.configurationId,
  expectedRevision: z.int().min(1).max(2147483647),
});
export const webhookSecretSchema = z.strictObject({
  secret: z.string().regex(/^whsec_[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/),
});
export const webhookPreviewInputSchema = webhookSecretInputSchema.extend({
  deliveryId: webhookConfigurationInputSchema.shape.configurationId,
});
export type WebhookSettings = z.infer<typeof webhookSettingsSchema>;
export type WebhookSecretInput = z.infer<typeof webhookSecretInputSchema>;
