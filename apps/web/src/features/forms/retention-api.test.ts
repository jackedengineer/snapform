import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  fetchRetention,
  saveRetention,
  commitRetention,
  retentionKey,
} from './retention-api';
const workspaceId = crypto.randomUUID();
const settings = {
  workspaceId,
  role: 'owner',
  days: 90,
  revision: 3,
  updatedAt: null,
};
afterEach(() => vi.unstubAllGlobals());
it('keeps a successful receipt when an older background read finishes afterward', async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const key = retentionKey('synthetic-owner', workspaceId);
  let finishRead: (value: typeof settings) => void = () => {
    throw Error('Read not started');
  };
  const read = cache
    .fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise<typeof settings>((resolve) => {
          finishRead = resolve;
        }),
    })
    .catch(() => undefined);
  const saved = { ...settings, days: 365, revision: 4 };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(saved)));
  try {
    await commitRetention(cache, 'synthetic-owner', workspaceId, {
      days: 365,
      expectedRevision: 3,
      acknowledgeDeletion: true,
    });
    finishRead(settings);
    await read;
    expect(cache.getQueryData(key)).toEqual(saved);
  } finally {
    cache.clear();
  }
});
it('loads validated retention without caching or crossing origins', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(settings));
  vi.stubGlobal('fetch', fetcher);
  expect(await fetchRetention(workspaceId)).toEqual(settings);
  expect(fetcher.mock.calls[0][0]).toBe(
    `/api/v1/workspaces/${workspaceId}/retention`,
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
  });
});
it('requires acknowledgement before any request and preserves the expected revision', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ ...settings, days: 30, revision: 4 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    saveRetention(workspaceId, {
      days: 30,
      expectedRevision: 3,
      acknowledgeDeletion: false,
    }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await saveRetention(workspaceId, {
    days: 30,
    expectedRevision: 3,
    acknowledgeDeletion: true,
  });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    days: 30,
    expectedRevision: 3,
    acknowledgeDeletion: true,
  });
});
it('does not silently retry a stale owner change', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: { code: 'RETENTION_CONFLICT' } }, { status: 409 }),
    );
  vi.stubGlobal('fetch', fetcher);
  await expect(
    saveRetention(workspaceId, {
      days: 30,
      expectedRevision: 3,
      acknowledgeDeletion: true,
    }),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
