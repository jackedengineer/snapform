import { expect, it } from 'vitest';
import {
  emailSettingsInputSchema,
  emailSettingsSchema,
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
