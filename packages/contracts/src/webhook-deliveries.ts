import { z } from 'zod';
import { webhookSecretInputSchema } from './webhook-settings.ts';
import { MAX_WEBHOOK_BYTES } from './webhook-protocol.ts';
const identity = webhookSecretInputSchema.shape.configurationId;
export const webhookSendInputSchema = webhookSecretInputSchema.extend({
  deliveryId: identity,
  expectedAttempts: z.int().min(0).max(7),
  acknowledgeDuplicateRisk: z.boolean(),
});
export const webhookSendReceiptSchema = z.strictObject({ id: identity });
export const webhookToggleInputSchema = webhookSecretInputSchema.extend({
  expectedRevision: z.int().min(1).max(2147483646),
  enabled: z.boolean(),
});
const status = z.enum([
  'preview',
  'pending',
  'sending',
  'acknowledged',
  'unknown',
  'needs_action',
  'cancelled',
]);
export const webhookPreviewSchema = z.strictObject({
  id: identity,
  configurationId: identity,
  versionId: identity,
  version: z.int().positive(),
  createdAt: z.iso.datetime(),
  status,
  payload: z.string().min(2).max(MAX_WEBHOOK_BYTES),
  url: z.string().max(2048),
});
export const webhookHistorySchema = z.strictObject({
  deliveries: z
    .array(
      z.strictObject({
        id: identity,
        configurationId: identity,
        versionId: identity,
        kind: z.enum(['test', 'response.submitted']),
        status,
        reason: z
          .enum([
            'disabled',
            'configuration-changed',
            'receiver-unconfirmed',
            'attempts-exhausted',
            'configuration',
            'payload-invalid',
            'rate-limited',
            'receiver-unavailable',
            'redirect-blocked',
            'authorization',
            'receiver-rejected',
            'retry-later',
          ])
          .nullable(),
        attempts: z.int().min(0).max(8),
        httpStatus: z.int().min(100).max(599).nullable(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
        availableAt: z.iso.datetime(),
        acknowledgedAt: z.iso.datetime().nullable(),
      }),
    )
    .max(20),
});
export type WebhookSendInput = z.infer<typeof webhookSendInputSchema>;
export type WebhookToggleInput = z.infer<typeof webhookToggleInputSchema>;
export type WebhookPreview = z.infer<typeof webhookPreviewSchema>;
export type WebhookHistory = z.infer<typeof webhookHistorySchema>;
