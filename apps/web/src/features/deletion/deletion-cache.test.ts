import { QueryClient } from '@tanstack/react-query';
import type { DeletionRequest } from '@snapform/contracts/deletion';
import { expect, it } from 'vitest';
import { deletionKey, cacheConfirmedDeletion } from './deletion-cache';
const target = { kind: 'response' as const, targetId: crypto.randomUUID() },
  workspaceId = crypto.randomUUID();
const scheduled: DeletionRequest = {
  id: crypto.randomUUID(),
  workspaceId,
  ...target,
  requestedAt: '2026-11-01T12:00:00.000Z',
  notBefore: '2026-11-02T12:00:00.000Z',
  cancelledAt: null,
  deletedAt: null,
  state: 'scheduled',
  revision: 1,
};
const cancelled: DeletionRequest = {
  ...scheduled,
  state: 'cancelled',
  cancelledAt: '2026-11-01T13:00:00.000Z',
  revision: 2,
};
it('prevents a delayed pre-mutation GET from replacing confirmed scheduling or cancellation', async () => {
  for (const [before, after] of [
    [null, scheduled],
    [scheduled, cancelled],
  ] as const) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const key = deletionKey('qa', workspaceId, target),
      other = deletionKey('qa', workspaceId, {
        ...target,
        targetId: crypto.randomUUID(),
      });
    client.setQueryData(key, before);
    client.setQueryData(other, 'unrelated');
    let finish: (value: DeletionRequest | null) => void = () => {};
    const read = client
      .fetchQuery({
        queryKey: key,
        queryFn: () =>
          new Promise<DeletionRequest | null>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    try {
      expect(
        await cacheConfirmedDeletion(client, key, after, { current: true }),
      ).toBe(true);
      finish(before);
      await read;
      expect(client.getQueryData(key)).toEqual(after);
      expect(client.getQueryData(other)).toBe('unrelated');
    } finally {
      finish(before);
      await read;
      client.clear();
    }
  }
});
it('does not repopulate cache after the control unmounts', async () => {
  const client = new QueryClient();
  const key = deletionKey('qa', workspaceId, target);
  const active = { current: true };
  const caching = cacheConfirmedDeletion(client, key, scheduled, active);
  active.current = false;
  expect(await caching).toBe(false);
  expect(client.getQueryData(key)).toBeUndefined();
  client.clear();
});
it('does not let an old unmounted control cancel a new same-target read', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const key = deletionKey('qa', workspaceId, target);
  let finish: (value: DeletionRequest) => void = () => {};
  const fresh = client
    .fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise<DeletionRequest>((resolve) => {
          finish = resolve;
        }),
    })
    .catch(() => undefined);
  try {
    expect(
      await cacheConfirmedDeletion(client, key, scheduled, { current: false }),
    ).toBe(false);
    expect(client.getQueryState(key)?.fetchStatus).toBe('fetching');
    finish(scheduled);
    await fresh;
    expect(client.getQueryData(key)).toEqual(scheduled);
  } finally {
    finish(scheduled);
    await fresh;
    client.clear();
  }
});
