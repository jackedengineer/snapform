import { expect, it } from 'vitest';
import {
  deletionRequestSchema,
  deletionInputSchema,
  cancelDeletionSchema,
  canCancelDeletion,
  deletionConfirmationMatches,
} from '../src/deletion.ts';
const workspaceId = crypto.randomUUID();
const request = () => ({
  id: crypto.randomUUID(),
  workspaceId,
  kind: 'response',
  targetId: crypto.randomUUID(),
  requestedAt: '2026-10-30T12:00:00.000Z',
  notBefore: '2026-10-31T12:00:00.000Z',
  cancelledAt: null,
  deletedAt: null,
  state: 'scheduled',
  revision: 1,
});
it('requires explicit acknowledgement, bounded confirmation and stable request identity', () => {
  expect(
    deletionInputSchema.parse({
      requestId: crypto.randomUUID(),
      confirmation: 'DELETE',
      acknowledgeDeletion: true,
    }),
  ).toBeDefined();
  for (const patch of [
    { acknowledgeDeletion: false },
    { role: 'owner' },
    { confirmation: '' },
    { confirmation: 'x'.repeat(161) },
    { requestId: 'unknown' },
  ])
    expect(
      deletionInputSchema.safeParse({
        requestId: crypto.randomUUID(),
        confirmation: 'DELETE',
        acknowledgeDeletion: true,
        ...patch,
      }).success,
    ).toBe(false);
  expect(cancelDeletionSchema.safeParse({ expectedRevision: 1 }).success).toBe(
    true,
  );
  expect(cancelDeletionSchema.safeParse({ expectedRevision: 0 }).success).toBe(
    false,
  );
  expect(
    cancelDeletionSchema.safeParse({ expectedRevision: 1, role: 'owner' })
      .success,
  ).toBe(false);
});
it('matches the exact target confirmation without trimming or case folding', () => {
  expect(deletionConfirmationMatches('response', 'Agency', 'DELETE')).toBe(
    true,
  );
  expect(deletionConfirmationMatches('response', 'Agency', 'delete')).toBe(
    false,
  );
  expect(deletionConfirmationMatches('workspace', 'Agency', 'Agency')).toBe(
    true,
  );
  expect(deletionConfirmationMatches('workspace', 'Agency', 'Agency ')).toBe(
    false,
  );
  expect(deletionConfirmationMatches('workspace', 'Agency', 'DELETE')).toBe(
    false,
  );
});
it('keeps the cancellation boundary strict and rejects inconsistent receipts', () => {
  const item = deletionRequestSchema.parse(request());
  expect(canCancelDeletion(item, Date.parse(item.notBefore) - 1)).toBe(true);
  expect(canCancelDeletion(item, Date.parse(item.notBefore))).toBe(false);
  expect(canCancelDeletion(item, NaN)).toBe(false);
  for (const state of ['purging', 'deleted', 'cancelled'] as const)
    expect(
      canCancelDeletion({ ...item, state }, Date.parse(item.requestedAt)),
    ).toBe(false);
  for (const patch of [
    { kind: 'workspace' },
    { state: 'cancelled' },
    { state: 'deleted' },
    { notBefore: '2026-10-29T12:00:00.000Z' },
    { revision: 0 },
    { extra: true },
  ])
    expect(
      deletionRequestSchema.safeParse({ ...request(), ...patch }).success,
    ).toBe(false);
  const workspace = { ...request(), kind: 'workspace', targetId: workspaceId };
  expect(deletionRequestSchema.safeParse(workspace).success).toBe(true);
  expect(
    deletionRequestSchema.safeParse({
      ...request(),
      state: 'cancelled',
      cancelledAt: '2026-10-30T13:00:00.000Z',
    }).success,
  ).toBe(true);
  expect(
    deletionRequestSchema.safeParse({
      ...request(),
      state: 'deleted',
      deletedAt: '2026-10-31T12:01:00.000Z',
    }).success,
  ).toBe(true);
});
