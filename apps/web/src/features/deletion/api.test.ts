import { afterEach, expect, it, vi } from 'vitest';
import { fetchDeletion, scheduleDeletion, cancelDeletion } from './api';
const workspaceId = crypto.randomUUID(),
  targetId = crypto.randomUUID(),
  requestId = crypto.randomUUID();
const target = { kind: 'response' as const, targetId };
const receipt = {
  id: requestId,
  workspaceId,
  ...target,
  requestedAt: '2026-11-01T12:00:00.000Z',
  notBefore: '2026-11-02T12:00:00.000Z',
  cancelledAt: null,
  deletedAt: null,
  state: 'scheduled',
  revision: 1,
};
afterEach(() => vi.unstubAllGlobals());
it('requires matching strict server receipts and preserves the scheduling identity', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ deletion: receipt }));
  vi.stubGlobal('fetch', transport);
  const input = {
    ...target,
    requestId,
    confirmation: 'DELETE',
    acknowledgeDeletion: true as const,
  };
  expect(await scheduleDeletion(workspaceId, input)).toEqual(receipt);
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual(input);
  for (const wrong of [
    { ...receipt, workspaceId: crypto.randomUUID() },
    { ...receipt, targetId: crypto.randomUUID() },
    { ...receipt, id: crypto.randomUUID() },
    { ...receipt, extra: true },
  ]) {
    transport.mockResolvedValueOnce(Response.json({ deletion: wrong }));
    await expect(scheduleDeletion(workspaceId, input)).rejects.toThrow(
      'confirm',
    );
  }
});
it('allows an authorized absence, checks target identity and sends the current cancellation revision', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ deletion: null }));
  vi.stubGlobal('fetch', transport);
  expect(await fetchDeletion(workspaceId, target)).toBeNull();
  const cancelled = {
    ...receipt,
    state: 'cancelled',
    cancelledAt: '2026-11-01T13:00:00.000Z',
    revision: 2,
  };
  transport.mockResolvedValueOnce(Response.json({ deletion: cancelled }));
  expect(await cancelDeletion({ ...receipt, state: 'scheduled' })).toEqual(
    cancelled,
  );
  expect(JSON.parse(String(transport.mock.calls[1][1]?.body))).toEqual({
    expectedRevision: 1,
  });
  expect(transport.mock.calls[1][0]).toBe(
    `/api/v1/workspaces/${workspaceId}/deletions/${requestId}/cancel`,
  );
});
it('keeps failures explicit and hides private provider diagnostics', async () => {
  for (const response of [
    Response.json({ private: 'diagnostic' }, { status: 500 }),
    Response.json({ deletion: { ...receipt, kind: 'workspace' } }),
    Response.json({ deletion: null }),
  ]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(
      scheduleDeletion(workspaceId, {
        ...target,
        requestId,
        confirmation: 'DELETE',
        acknowledgeDeletion: true,
      }),
    ).rejects.toThrow('confirm');
  }
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('private detail')));
  await expect(fetchDeletion(workspaceId, target)).rejects.toThrow('confirm');
});
