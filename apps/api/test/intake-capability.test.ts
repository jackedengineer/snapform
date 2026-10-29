import { expect, it } from 'vitest';
import {
  mintIntakeCapability,
  intakeAuthorizationHash,
} from '../src/intake-capability.ts';
it('mints independent native credentials and authenticates their exact hash', async () => {
  const [first, second] = await Promise.all([
    mintIntakeCapability(),
    mintIntakeCapability(),
  ]);
  expect(first.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(second.capability).not.toBe(first.capability);
  expect(await intakeAuthorizationHash('Bearer ' + first.capability)).toBe(
    first.hash,
  );
  expect(await intakeAuthorizationHash('bearer ' + first.capability)).toBe(
    first.hash,
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
