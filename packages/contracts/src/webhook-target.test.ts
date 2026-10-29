import { expect, it } from 'vitest';
import { parseWebhookTarget } from './webhook-target.ts';
it('normalizes public HTTPS targets without losing receiver paths or query values', () => {
  expect(
    parseWebhookTarget('https://HOOKS.example.com:443/intake?a=1%2F2'),
  ).toBe('https://hooks.example.com/intake?a=1%2F2');
});
it('rejects credentials, fragments, private names, IP encodings, other protocols and oversized URLs', () => {
  for (const input of [
    undefined,
    42,
    '',
    'http://hooks.example.com/',
    'https://user:password@hooks.example.com/',
    'https://hooks.example.com/#private',
    'https://hooks.example.com:8443/',
    'https://localhost/',
    'https://a.localhost/',
    'https://metadata.google.internal/',
    'https://receiver.local/',
    'https://receiver.test/',
    'https://receiver.invalid/',
    'https://receiver/',
    'https://127.0.0.1/',
    'https://2130706433/',
    'https://0x7f000001/',
    'https://[::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://snapform.jacked.dev/api/',
    'https://other.jacked.dev/',
    'https://hooks.example.com./',
    'https://hooks.example.com/\nsecret',
    'https://hooks.example.com/' + 'x'.repeat(2048),
  ]) {
    expect(() => parseWebhookTarget(input)).toThrow('INVALID_WEBHOOK_TARGET');
  }
});
