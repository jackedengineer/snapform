import { expect, it } from 'vitest';
import {
  capabilitySchema,
  capabilityHashSchema,
  createIntakeSchema,
  intakeEnvelopeSchema,
} from '../src/intake.ts';
import { formFixture } from './form-fixture.ts';
it('keeps capability material strict and creation free of caller-selected ownership', () => {
  expect(capabilitySchema.safeParse('a'.repeat(43)).success).toBe(true);
  for (const token of [
    '',
    'a'.repeat(42),
    'a'.repeat(44),
    'Bearer ' + 'a'.repeat(43),
  ])
    expect(capabilitySchema.safeParse(token).success).toBe(false);
  expect(capabilityHashSchema.safeParse('0'.repeat(64)).success).toBe(true);
  expect(createIntakeSchema.safeParse({}).success).toBe(true);
  expect(
    createIntakeSchema.safeParse({ workspaceId: crypto.randomUUID() }).success,
  ).toBe(false);
});
it('returns only a pinned session snapshot, never capability hashes or account roles', () => {
  const session = {
    id: crypto.randomUUID(),
    publicId: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    definition: formFixture().definition,
    revision: 1,
    answers: {},
    expiresAt: '2026-10-30T00:00:00.000Z',
    status: 'collecting',
  };
  expect(intakeEnvelopeSchema.safeParse({ session }).success).toBe(true);
  expect(
    intakeEnvelopeSchema.safeParse({
      session: { ...session, capabilityHash: '0'.repeat(64) },
    }).success,
  ).toBe(false);
  expect(
    intakeEnvelopeSchema.safeParse({ session: { ...session, role: 'owner' } })
      .success,
  ).toBe(false);
});
