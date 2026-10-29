import { expect, it } from 'vitest';
import { reconcileRecovery } from './reconcile';
import { newRecovery } from './recovery';
import { formFixture } from '../../../../../packages/contracts/test/form-fixture.ts';
function fixture() {
  const record = newRecovery(crypto.randomUUID()),
    { definition, ids } = formFixture();
  const session = {
    id: record.identity.id,
    publicId: record.publicId,
    versionId: crypto.randomUUID(),
    definition,
    revision: 3,
    answers: { [ids.budget]: { state: 'value' as const, value: '0' } },
    expiresAt: new Date(record.expiresAt).toISOString(),
    status: 'collecting' as const,
  };
  return { record: { ...record, session }, session, ids };
}
it('preserves local answers on a newer revision until replacement is explicitly selected', () => {
  const { record, session, ids } = fixture(),
    saved = {
      ...session,
      revision: 4,
      answers: { [ids.budget]: { state: 'value' as const, value: '125' } },
    };
  const conflict = reconcileRecovery(record, saved, false);
  expect(conflict.conflict).toBe(true);
  expect(conflict.record.session?.answers[ids.budget]).toEqual({
    state: 'value',
    value: '0',
  });
  const selected = reconcileRecovery(record, saved, true);
  expect(selected.conflict).toBe(false);
  expect(selected.record.session?.revision).toBe(4);
  expect(selected.record.session?.answers[ids.budget]).toEqual({
    state: 'value',
    value: '125',
  });
  expect(selected.record.identity).toEqual(record.identity);
});
it('retains uncertain operations and refuses another pinned identity/version', () => {
  const { record, session } = fixture();
  const pending = {
    kind: 'save' as const,
    input: {
      operationId: crypto.randomUUID(),
      expectedRevision: 3,
      answers: {},
    },
  };
  expect(
    reconcileRecovery(
      { ...record, pending },
      { ...session, revision: 4 },
      false,
    ).record.pending,
  ).toEqual(pending);
  expect(() =>
    reconcileRecovery(
      record,
      { ...session, versionId: crypto.randomUUID() },
      true,
    ),
  ).toThrow();
  expect(() =>
    reconcileRecovery(record, { ...session, id: crypto.randomUUID() }, true),
  ).toThrow();
});
