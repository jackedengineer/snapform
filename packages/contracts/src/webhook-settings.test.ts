import { expect, it } from 'vitest';
import { webhookConfigurationInputSchema } from './webhook-settings.ts';
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
