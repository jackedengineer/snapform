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
