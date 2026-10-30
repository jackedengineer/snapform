import { expect, it } from 'vitest';
import { retentionInputSchema, retentionSettingsSchema } from './retention.ts';
const workspaceId = '28765529-6337-4512-b148-f735ad07d28b';
it('accepts only the disclosed retention choices with explicit deletion acknowledgment', () => {
  for (const days of [30, 90, 365])
    expect(
      retentionInputSchema.parse({
        days,
        expectedRevision: 0,
        acknowledgeDeletion: true,
      }).days,
    ).toBe(days);
  for (const value of [
    { days: 0, expectedRevision: 0, acknowledgeDeletion: true },
    { days: 31, expectedRevision: 0, acknowledgeDeletion: true },
    { days: '90', expectedRevision: 0, acknowledgeDeletion: true },
    { days: 90, expectedRevision: -1, acknowledgeDeletion: true },
    { days: 90, expectedRevision: 0, acknowledgeDeletion: false },
    { days: 90, expectedRevision: 0 },
    { days: 90, expectedRevision: 0, acknowledgeDeletion: true, role: 'owner' },
  ])
    expect(retentionInputSchema.safeParse(value).success).toBe(false);
});
it('projects versioned settings without actor IDs or extra private state', () => {
  const settings = {
    workspaceId,
    role: 'viewer',
    days: 90,
    revision: 0,
    updatedAt: null,
  };
  expect(retentionSettingsSchema.parse(settings)).toEqual(settings);
  expect(
    retentionSettingsSchema.safeParse({
      ...settings,
      updatedBy: 'private-user-id',
    }).success,
  ).toBe(false);
  expect(
    retentionSettingsSchema.safeParse({ ...settings, revision: -1 }).success,
  ).toBe(false);
  expect(
    retentionSettingsSchema.safeParse({ ...settings, updatedAt: 'yesterday' })
      .success,
  ).toBe(false);
});
