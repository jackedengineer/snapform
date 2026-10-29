import { expect, it } from 'vitest';
import { intakeAuthorizationHash } from '../src/intake-capability.ts';
import { newIntakeIdentity } from '../../web/src/features/intake/identity.ts';
it('mints independent native client credentials and authenticates their exact hash', async () => {
  const first = newIntakeIdentity(),
    second = newIntakeIdentity();
  expect(first.id).not.toBe(second.id);
  expect(first.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(second.capability).not.toBe(first.capability);
  const hash = await intakeAuthorizationHash('Bearer ' + first.capability);
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(await intakeAuthorizationHash('bearer ' + first.capability)).toBe(
    hash,
  );
  expect(await intakeAuthorizationHash('Bearer ' + second.capability)).not.toBe(
    hash,
  );
});
it('matches the independently calculated SHA-256 credential vector', async () => {
  expect(await intakeAuthorizationHash('Bearer ' + 'a'.repeat(43))).toBe(
    '66d34fba71f8f450f7e45598853e53bfc23bbd129027cbb131a2f4ffd7878cd0',
  );
});
it('rejects ambiguous or malformed authorization instead of falling back to account identity', async () => {
  for (const value of [
    undefined,
    '',
    'Basic ' + 'a'.repeat(43),
    'Bearer ' + 'a'.repeat(42),
    'Bearer ' + 'a'.repeat(44),
    'Bearer ' + 'a'.repeat(43) + ' extra',
    'Bearer ' + 'a'.repeat(43) + '=',
  ])
    expect(await intakeAuthorizationHash(value)).toBeNull();
});
