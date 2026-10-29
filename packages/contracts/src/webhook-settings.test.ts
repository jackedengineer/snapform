import { expect, it } from 'vitest';
import {
  webhookConfigurationInputSchema,
  webhookSettingsSchema,
  webhookSecretSchema,
  webhookSecretInputSchema,
} from './webhook-settings.ts';
const input = {
  configurationId: 'ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF',
  url: 'https://HOOKS.example.com:443/intake',
  expectedRevision: 0,
};
it('normalizes a bounded configuration and rejects privileged fields and unsafe destinations', () => {
  expect(webhookConfigurationInputSchema.parse(input)).toEqual({
    ...input,
    configurationId: input.configurationId.toLowerCase(),
    url: 'https://hooks.example.com/intake',
  });
  for (const value of [
    { ...input, enabled: true },
    { ...input, secret: 'chosen-by-client' },
    { ...input, verifiedAt: new Date().toISOString() },
    { ...input, expectedRevision: -1 },
    { ...input, expectedRevision: 2147483647 },
    { ...input, url: 'https://127.0.0.1/' },
    { ...input, url: 'https://user:secret@hooks.example.com/' },
    { ...input, url: 'x'.repeat(2049) },
    { ...input, configurationId: 'invalid' },
  ])
    expect(webhookConfigurationInputSchema.safeParse(value).success).toBe(
      false,
    );
});
it('accepts verified state while rejecting leaked signing material and impossible enablement', () => {
  const absent = {
    enabled: false,
    revision: 0,
    configurationId: null,
    url: null,
    verifiedAt: null,
  };
  const saved = {
    ...absent,
    revision: 1,
    configurationId: input.configurationId.toLowerCase(),
    url: 'https://hooks.example.com/intake',
  };
  expect(webhookSettingsSchema.parse(absent)).toEqual(absent);
  expect(webhookSettingsSchema.parse(saved)).toEqual(saved);
  expect(
    webhookSettingsSchema.safeParse({
      ...saved,
      enabled: true,
      verifiedAt: '2026-10-30T00:00:00.000Z',
    }).success,
  ).toBe(true);
  for (const value of [
    { ...saved, secret: 'private' },
    { ...saved, sealed: 'private' },
    { ...absent, enabled: true },
    { ...saved, enabled: true },
    { ...saved, url: null },
  ])
    expect(webhookSettingsSchema.safeParse(value).success).toBe(false);
  const secret = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
  expect(webhookSecretSchema.parse({ secret })).toEqual({ secret });
  expect(webhookSecretSchema.safeParse({ secret: 'invalid' }).success).toBe(
    false,
  );
  expect(
    webhookSecretInputSchema.safeParse({
      configurationId: input.configurationId,
      expectedRevision: 0,
    }).success,
  ).toBe(false);
});
