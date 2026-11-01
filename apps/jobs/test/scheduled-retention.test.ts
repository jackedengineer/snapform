import { beforeEach, expect, it, vi } from 'vitest';
import { createScheduledController, env } from 'cloudflare:test';
import { openDatabase } from '@snapform/database';
import type { Database } from '@snapform/database';
import {
  claimOwnerDeletions,
  claimExpiredResponses,
  finalizeWorkspacePurge,
  finalizeResponsePurge,
  pruneDeletionMetadata,
} from '@snapform/database/purge';
import { openPurgeIntent } from '@snapform/contracts/purge';
import worker from '../src/worker';
vi.mock('@snapform/database', () => ({ openDatabase: vi.fn() }));
vi.mock('@snapform/database/purge', () => ({
  claimOwnerDeletions: vi.fn(async () => []),
  claimExpiredResponses: vi.fn(async () => []),
  finalizeWorkspacePurge: vi.fn(),
  finalizeResponsePurge: vi.fn(),
  pruneDeletionMetadata: vi.fn(async () => ({
    requestsDeleted: 0,
    intentsDeleted: 0,
  })),
}));
vi.mock('@snapform/database/outbox', () => ({
  claimResponseEvents: vi.fn(async () => []),
  recordResponseDispatch: vi.fn(),
  acknowledgeResponseEvent: vi.fn(),
}));
vi.mock('@snapform/database/notification-delivery', () => ({
  claimOwnerEmails: vi.fn(async () => []),
  prepareOwnerEmail: vi.fn(),
  recordOwnerEmail: vi.fn(),
  recordOwnerProviderStatus: vi.fn(),
}));
vi.mock('@snapform/database/webhook-attempts', () => ({
  claimWebhooks: vi.fn(async () => []),
  prepareWebhookPayload: vi.fn(),
  recordWebhookAttempt: vi.fn(),
}));
const close = vi.fn(async () => {}),
  secret = btoa('j'.repeat(32));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(openDatabase).mockResolvedValue({ db: {} as Database, close });
  vi.mocked(claimOwnerDeletions).mockResolvedValue([]);
  vi.mocked(claimExpiredResponses).mockResolvedValue([]);
  vi.mocked(pruneDeletionMetadata).mockResolvedValue({
    requestsDeleted: 0,
    intentsDeleted: 0,
  });
});
const configuration = () => ({
  ...env,
  DATABASE_URL: 'postgresql://snapform_jobs@localhost/snapform',
  PURGE_ENABLED: '1',
  PURGE_LEDGER_KEY: secret,
});
it('routes a scheduled event through real R2 before the correct workspace and response finalizers', async () => {
  const workspace = crypto.randomUUID();
  const owner = {
    id: crypto.randomUUID(),
    workspaceId: workspace,
    targetId: workspace,
    kind: 'workspace' as const,
    reason: 'owner' as const,
    createdAt: '2026-11-01T12:00:00.000Z',
  };
  const expired = {
    ...owner,
    id: crypto.randomUUID(),
    kind: 'response' as const,
    reason: 'expired' as const,
    targetId: crypto.randomUUID(),
  };
  vi.mocked(claimOwnerDeletions).mockResolvedValue([owner]);
  vi.mocked(claimExpiredResponses).mockResolvedValue([expired]);
  for (const finalize of [finalizeWorkspacePurge, finalizeResponsePurge])
    vi.mocked(finalize).mockImplementation(async (_db, item) => {
      const object = await env.PURGE_LEDGER.get(`intents/${item.id}.enc`);
      if (!object) throw Error('Deletion attempted before durable ledger');
      expect(
        await openPurgeIntent(await object.text(), secret, item.id),
      ).toEqual(item);
      return true;
    });
  try {
    await worker.scheduled(createScheduledController(), configuration());
    expect(finalizeWorkspacePurge).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      owner,
    );
    expect(finalizeResponsePurge).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expired,
    );
    expect(close).toHaveBeenCalledOnce();
    expect(pruneDeletionMetadata).toHaveBeenCalledOnce();
  } finally {
    for (const item of [owner, expired])
      await env.PURGE_LEDGER.delete(`intents/${item.id}.enc`);
  }
});
it('keeps activation off by default and fails closed on an enabled invalid key', async () => {
  await worker.scheduled(createScheduledController(), {
    ...configuration(),
    PURGE_ENABLED: '0',
  });
  await expect(
    worker.scheduled(createScheduledController(), {
      ...configuration(),
      PURGE_LEDGER_KEY: 'invalid',
    }),
  ).rejects.toThrow('Response jobs failed');
  expect(claimOwnerDeletions).not.toHaveBeenCalled();
  expect(claimExpiredResponses).not.toHaveBeenCalled();
  expect(finalizeWorkspacePurge).not.toHaveBeenCalled();
  expect(finalizeResponsePurge).not.toHaveBeenCalled();
  expect(pruneDeletionMetadata).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(2);
});
it('reports metadata cleanup failures and still closes the database connection', async () => {
  vi.mocked(pruneDeletionMetadata).mockRejectedValueOnce(Error('Unavailable'));
  await expect(
    worker.scheduled(createScheduledController(), configuration()),
  ).rejects.toThrow('Response jobs failed');
  expect(close).toHaveBeenCalledOnce();
});
