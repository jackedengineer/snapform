import { expect, it } from 'vitest';
import {
  emailOverviewSchema,
  emailSettingsInputSchema,
  emailSettingsSchema,
  emailRetryInputSchema,
} from './notifications.ts';
it('accepts explicit opt-in and versioned disabled settings', () => {
  expect(
    emailSettingsInputSchema.parse({ enabled: true, expectedRevision: 0 }),
  ).toEqual({ enabled: true, expectedRevision: 0 });
  expect(emailSettingsSchema.parse({ enabled: false, revision: 0 })).toEqual({
    enabled: false,
    revision: 0,
  });
  expect(emailSettingsSchema.parse({ enabled: true, revision: 1 })).toEqual({
    enabled: true,
    revision: 1,
  });
});
it('rejects caller-supplied recipients, untyped flags and invalid revisions', () => {
  for (const value of [
    { enabled: true, expectedRevision: 0, to: 'other@example.invalid' },
    { enabled: 'true', expectedRevision: 0 },
    { enabled: true, expectedRevision: -1 },
    { enabled: true, expectedRevision: 2147483647 },
  ])
    expect(emailSettingsInputSchema.safeParse(value).success).toBe(false);
});
it('cannot report enabled notifications without a saved configuration revision', () => {
  expect(
    emailSettingsSchema.safeParse({ enabled: true, revision: 0 }).success,
  ).toBe(false);
});
it('bounds delivery summaries and rejects recipient details or unknown outcomes', () => {
  const delivery = {
    id: crypto.randomUUID(),
    responseId: crypto.randomUUID(),
    status: 'accepted',
    attempts: 1,
    retryable: false,
    reason: null,
    createdAt: '2026-10-29T12:00:00.000Z',
  };
  const overview = {
    settings: { enabled: true, revision: 1 },
    deliveries: [delivery],
  };
  expect(emailOverviewSchema.parse(overview)).toEqual(overview);
  for (const value of [
    {
      ...overview,
      deliveries: [{ ...delivery, recipient: 'private@example.invalid' }],
    },
    { ...overview, deliveries: [{ ...delivery, status: 'sent-forever' }] },
    { ...overview, deliveries: [{ ...delivery, attempts: 9 }] },
    { ...overview, deliveries: Array(21).fill(delivery) },
  ])
    expect(emailOverviewSchema.safeParse(value).success).toBe(false);
});
it('requires an exact delivery identity and bounded attempt count for retries', () => {
  const input = { deliveryId: crypto.randomUUID(), expectedAttempts: 0 };
  expect(emailRetryInputSchema.parse(input)).toEqual(input);
  for (const value of [
    { ...input, deliveryId: 'other' },
    { ...input, expectedAttempts: -1 },
    { ...input, expectedAttempts: 8 },
    { ...input, expectedAttempts: '1' },
    { ...input, to: 'other@example.invalid' },
  ])
    expect(emailRetryInputSchema.safeParse(value).success).toBe(false);
});
