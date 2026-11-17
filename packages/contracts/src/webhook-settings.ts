import { z } from './zod.ts';
import { parseWebhookTarget } from './webhook-target.ts';
const revision = (min: number, max: number) =>
  z.int().check(z.minimum(min), z.maximum(max));
export const webhookConfigurationInputSchema = z.strictObject({
  configurationId: z.pipe(
    z.uuid(),
    z.transform((value: string) => value.toLowerCase()),
  ),
  expectedRevision: revision(0, 2147483646),
  url: z.pipe(
    z.string().check(z.maxLength(2048)),
    z.transform((value: string, payload) => {
      try {
        return parseWebhookTarget(value);
      } catch {
        payload.issues.push({
          code: 'custom',
          message: 'Use a public HTTPS endpoint on port 443.',
          input: value,
        });
        return z.NEVER;
      }
    }),
  ),
});
export type WebhookConfigurationInput = z.infer<
  typeof webhookConfigurationInputSchema
>;
export const webhookSettingsSchema = z
  .strictObject({
    enabled: z.boolean(),
    revision: revision(0, 2147483647),
    configurationId: z.nullable(z.uuid()),
    url: z.nullable(z.string().check(z.maxLength(2048))),
    verifiedAt: z.nullable(z.iso.datetime()),
    // A saved endpoint that can no longer be read or used (for example after
    // a key rotation or a new target rule). Its URL is never returned, and
    // the owner must enter a new one. Absent from older servers.
    attention: z.optional(z.nullable(z.literal('DESTINATION_UNAVAILABLE'))),
  })
  .check(
    z.refine((value) =>
      value.revision === 0
        ? !value.enabled &&
          value.configurationId === null &&
          value.url === null &&
          value.verifiedAt === null &&
          !value.attention
        : value.configurationId !== null &&
          (value.attention ? value.url === null : value.url !== null) &&
          (!value.enabled || value.verifiedAt !== null),
    ),
  );
export const webhookSecretInputSchema = z.strictObject({
  configurationId: webhookConfigurationInputSchema.shape.configurationId,
  expectedRevision: revision(1, 2147483647),
});
export const webhookSecretSchema = z.strictObject({
  secret: z
    .string()
    .check(z.regex(/^whsec_[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/)),
});
export const webhookPreviewInputSchema = z.extend(webhookSecretInputSchema, {
  deliveryId: webhookConfigurationInputSchema.shape.configurationId,
});
export type WebhookSettings = z.infer<typeof webhookSettingsSchema>;
export type WebhookSecretInput = z.infer<typeof webhookSecretInputSchema>;
