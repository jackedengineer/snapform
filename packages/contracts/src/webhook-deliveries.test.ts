import { expect, it } from 'vitest';
import {
  webhookSendInputSchema,
  webhookToggleInputSchema,
  webhookPreviewSchema,
  webhookHistorySchema,
  canOfferWebhookRetry,
} from './webhook-deliveries.ts';
const configurationId = crypto.randomUUID(),
  deliveryId = crypto.randomUUID();
const input = {
  configurationId,
  deliveryId,
  expectedRevision: 1,
  expectedAttempts: 0,
  acknowledgeDuplicateRisk: false,
};
it('requires explicit bounded retry context and rejects privileged client data', () => {
  expect(webhookSendInputSchema.parse(input)).toEqual(input);
  for (const value of [
    { ...input, expectedAttempts: 8 },
    { ...input, expectedAttempts: -1 },
    { ...input, expectedRevision: 0 },
    { ...input, acknowledgeDuplicateRisk: undefined },
    { ...input, payload: '{}' },
    { ...input, url: 'https://hooks.example.com' },
    { ...input, configurationId: 'foreign' },
  ])
    expect(webhookSendInputSchema.safeParse(value).success).toBe(false);
  expect(
    webhookToggleInputSchema.parse({
      configurationId,
      expectedRevision: 1,
      enabled: true,
    }).enabled,
  ).toBe(true);
  expect(
    webhookToggleInputSchema.safeParse({
      configurationId,
      expectedRevision: 2147483647,
      enabled: true,
    }).success,
  ).toBe(false);
});
it('offers repair only for the current endpoint, bounded attempts and a compatible enabled state', () => {
  const current = {
    configurationId,
    enabled: false,
    versionId: crypto.randomUUID(),
  };
  const delivery = {
    configurationId,
    versionId: current.versionId,
    kind: 'test' as const,
    status: 'unknown' as const,
    reason: 'receiver-unconfirmed',
    attempts: 1,
  };
  expect(canOfferWebhookRetry(delivery, current)).toBe(true);
  expect(
    canOfferWebhookRetry(
      { ...delivery, status: 'needs_action', reason: 'authorization' },
      current,
    ),
  ).toBe(true);
  for (const changed of [
    { ...delivery, configurationId: crypto.randomUUID() },
    { ...delivery, versionId: crypto.randomUUID() },
    { ...delivery, attempts: 8 },
    { ...delivery, attempts: 0 },
    { ...delivery, status: 'acknowledged' as const },
    { ...delivery, status: 'needs_action' as const, reason: 'payload-invalid' },
    { ...delivery, kind: 'response.submitted' as const },
  ])
    expect(canOfferWebhookRetry(changed, current)).toBe(false);
  expect(
    canOfferWebhookRetry(
      { ...delivery, kind: 'response.submitted' },
      { ...current, enabled: true },
    ),
  ).toBe(true);
});
it('strictly projects synthetic previews and content-free bounded history', () => {
  const at = new Date().toISOString();
  const preview = {
    id: deliveryId,
    configurationId,
    versionId: crypto.randomUUID(),
    version: 1,
    status: 'preview',
    createdAt: at,
    payload: '{"test":true}',
    url: 'https://hooks.example.com/qa',
  };
  expect(webhookPreviewSchema.parse(preview)).toEqual(preview);
  expect(
    webhookPreviewSchema.safeParse({ ...preview, secret: 'private' }).success,
  ).toBe(false);
  const delivery = {
    id: deliveryId,
    configurationId,
    versionId: preview.versionId,
    kind: 'test',
    status: 'pending',
    reason: null,
    attempts: 0,
    httpStatus: null,
    createdAt: at,
    updatedAt: at,
    availableAt: at,
    acknowledgedAt: null,
  };
  expect(
    webhookHistorySchema.parse({ deliveries: [delivery] }).deliveries,
  ).toHaveLength(1);
  for (const value of [
    { ...delivery, payload: 'private' },
    { ...delivery, leaseToken: 'private' },
    { ...delivery, status: 'invented' },
    { ...delivery, reason: 'private provider diagnostic' },
  ])
    expect(
      webhookHistorySchema.safeParse({ deliveries: [value] }).success,
    ).toBe(false);
  expect(
    webhookHistorySchema.safeParse({
      deliveries: Array.from({ length: 21 }, () => delivery),
    }).success,
  ).toBe(false);
});
