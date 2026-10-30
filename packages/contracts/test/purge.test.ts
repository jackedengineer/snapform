import { expect, it } from 'vitest';
import {
  purgeIntentSchema,
  sealPurgeIntent,
  openPurgeIntent,
} from '../src/purge';
const secret = btoa('s'.repeat(32));
const intent = {
  id: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  kind: 'response' as const,
  targetId: crypto.randomUUID(),
  reason: 'expired' as const,
  createdAt: '2026-10-30T12:00:00.000Z',
};
it('authenticates content-free purge metadata and binds it to its ledger identity', async () => {
  const sealed = await sealPurgeIntent(intent, secret);
  expect(sealed).not.toContain(intent.targetId);
  expect(await sealPurgeIntent(intent, secret)).not.toBe(sealed);
  expect(await openPurgeIntent(sealed, secret, intent.id)).toEqual(intent);
  await expect(
    openPurgeIntent(sealed, secret, crypto.randomUUID()),
  ).rejects.toThrow('INVALID_PURGE_LEDGER');
  await expect(
    openPurgeIntent(sealed, btoa('x'.repeat(32)), intent.id),
  ).rejects.toThrow('INVALID_PURGE_LEDGER');
  const parts = sealed.split('.');
  const changed = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  changed[0] ^= 1;
  parts[2] = btoa(String.fromCharCode(...changed));
  await expect(
    openPurgeIntent(parts.join('.'), secret, intent.id),
  ).rejects.toThrow('INVALID_PURGE_LEDGER');
});
it('rejects unknown content, invalid identifiers, keys, versions and unbounded encodings', async () => {
  for (const input of [
    { ...intent, answers: {} },
    { ...intent, kind: 'form' },
    { ...intent, createdAt: 'yesterday' },
    { ...intent, id: 'invalid' },
  ])
    expect(purgeIntentSchema.safeParse(input).success).toBe(false);
  await expect(
    sealPurgeIntent({ ...intent, answers: {} }, secret),
  ).rejects.toThrow('INVALID_PURGE_LEDGER');
  for (const key of ['', 'x', btoa('x'.repeat(31)), btoa('x'.repeat(33))])
    await expect(sealPurgeIntent(intent, key)).rejects.toThrow(
      'INVALID_PURGE_LEDGER',
    );
  for (const text of [
    '',
    'v2.a.b',
    'v1.!.!',
    'v1.' + 'A'.repeat(9000),
    'v1.YQ==.YQ==',
  ])
    await expect(openPurgeIntent(text, secret, intent.id)).rejects.toThrow(
      'INVALID_PURGE_LEDGER',
    );
});
