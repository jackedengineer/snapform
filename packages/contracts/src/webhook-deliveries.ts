import { z } from './zod.ts';
import { webhookSecretInputSchema } from './webhook-settings.ts';
import { MAX_WEBHOOK_BYTES } from './webhook-protocol.ts';
const identity = webhookSecretInputSchema.shape.configurationId;
const count = (min: number, max: number) =>
  z.int().check(z.minimum(min), z.maximum(max));
export const webhookSendInputSchema = z.extend(webhookSecretInputSchema, {
  deliveryId: identity,
  expectedAttempts: count(0, 7),
  acknowledgeDuplicateRisk: z.boolean(),
});
export const webhookSendReceiptSchema = z.strictObject({ id: identity });
export const webhookToggleInputSchema = z.extend(webhookSecretInputSchema, {
  expectedRevision: count(1, 2147483646),
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
  version: z.int().check(z.positive()),
  createdAt: z.iso.datetime(),
  status,
  payload: z.string().check(z.minLength(2), z.maxLength(MAX_WEBHOOK_BYTES)),
  url: z.string().check(z.maxLength(2048)),
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
        reason: z.nullable(
          z.enum([
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
          ]),
        ),
        attempts: count(0, 8),
        httpStatus: z.nullable(count(100, 599)),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
        availableAt: z.iso.datetime(),
        acknowledgedAt: z.nullable(z.iso.datetime()),
      }),
    )
    .check(z.maxLength(20)),
});
export type WebhookSendInput = z.infer<typeof webhookSendInputSchema>;
export type WebhookToggleInput = z.infer<typeof webhookToggleInputSchema>;
export type WebhookPreview = z.infer<typeof webhookPreviewSchema>;
export type WebhookHistory = z.infer<typeof webhookHistorySchema>;

// Display eligibility only; the database rechecks authorization and state on send.
export function canOfferWebhookRetry(
  delivery: Pick<
    WebhookHistory['deliveries'][number],
    'configurationId' | 'versionId' | 'kind' | 'status' | 'attempts'
  > & { reason: string | null },
  current: {
    configurationId: string | null;
    enabled: boolean;
    versionId: string | null;
  },
) {
  if (
    delivery.configurationId !== current.configurationId ||
    delivery.attempts < 1 ||
    delivery.attempts >= 8 ||
    (delivery.kind === 'test'
      ? delivery.versionId !== current.versionId
      : !current.enabled)
  )
    return false;
  return (
    delivery.status === 'unknown' ||
    (delivery.status === 'needs_action' &&
      [
        'configuration',
        'redirect-blocked',
        'authorization',
        'receiver-rejected',
        'retry-later',
      ].includes(delivery.reason ?? ''))
  );
}
