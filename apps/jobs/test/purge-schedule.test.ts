import { expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { runScheduledPurge } from '../src/purge-ledger';
import { openPurgeIntent } from '@snapform/contracts/purge';
const secret = btoa('k'.repeat(32));
const response = () => ({
  id: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  kind: 'response' as const,
  targetId: crypto.randomUUID(),
  reason: 'expired' as const,
  createdAt: '2026-11-01T12:00:00.000Z',
});
it('requires explicit activation and valid durable configuration before claiming anything', async () => {
  const commands = {
    owner: vi.fn(async () => []),
    expired: vi.fn(async () => []),
    finalize: vi.fn(async () => true),
  };
  expect(await runScheduledPurge({}, commands)).toEqual({
    claimed: 0,
    completed: 0,
    failed: 0,
  });
  for (const configuration of [
    { enabled: '1', secret },
    { enabled: '1', secret: '', bucket: env.PURGE_LEDGER },
    { enabled: '1', secret: btoa('k'.repeat(31)), bucket: env.PURGE_LEDGER },
  ])
    await expect(runScheduledPurge(configuration, commands)).rejects.toThrow();
  expect(commands.owner).not.toHaveBeenCalled();
  expect(commands.expired).not.toHaveBeenCalled();
  expect(commands.finalize).not.toHaveBeenCalled();
});
it('processes due owner deletion before expiry and acknowledges encrypted R2 metadata before finalizing', async () => {
  const expired = response(),
    workspace = crypto.randomUUID();
  const owner = {
    ...response(),
    kind: 'workspace' as const,
    reason: 'owner' as const,
    workspaceId: workspace,
    targetId: workspace,
  };
  const order: string[] = [];
  try {
    const result = await runScheduledPurge(
      { enabled: '1', secret, bucket: env.PURGE_LEDGER },
      {
        owner: async () => {
          order.push('owner');
          return [owner];
        },
        expired: async () => {
          order.push('expiry');
          return [expired];
        },
        finalize: async (intent) => {
          const object = await env.PURGE_LEDGER.get(`intents/${intent.id}.enc`);
          if (!object)
            throw Error('Missing durable intent before finalization');
          expect(
            await openPurgeIntent(await object.text(), secret, intent.id),
          ).toEqual(intent);
          order.push(intent.kind);
          return true;
        },
      },
    );
    expect(result).toEqual({ claimed: 2, completed: 2, failed: 0 });
    expect(order).toEqual(['owner', 'workspace', 'expiry', 'response']);
  } finally {
    for (const item of [owner, expired])
      await env.PURGE_LEDGER.delete(`intents/${item.id}.enc`);
  }
});
it('leaves a conflicting ledger retryable while completing unrelated eligible work', async () => {
  const owner = { ...response(), reason: 'owner' as const },
    expired = response();
  const finalize = vi.fn(async () => true);
  await env.PURGE_LEDGER.put(`intents/${owner.id}.enc`, 'corrupt');
  try {
    expect(
      await runScheduledPurge(
        { enabled: '1', secret, bucket: env.PURGE_LEDGER },
        {
          owner: async () => [owner],
          expired: async () => [expired],
          finalize,
        },
      ),
    ).toEqual({ claimed: 2, completed: 1, failed: 1 });
    expect(finalize).toHaveBeenCalledExactlyOnceWith(expired);
  } finally {
    for (const item of [owner, expired])
      await env.PURGE_LEDGER.delete(`intents/${item.id}.enc`);
  }
});
