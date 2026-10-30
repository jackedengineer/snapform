import { expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { persistPurgeIntent, runPurgeBatch } from '../src/purge-ledger';
import { openPurgeIntent } from '@snapform/contracts/purge';
const secret = btoa('s'.repeat(32));
const intent = () => ({
  id: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  kind: 'response' as const,
  targetId: crypto.randomUUID(),
  reason: 'expired' as const,
  createdAt: '2026-10-30T12:00:00.000Z',
});
it('uses real Worker R2 conditional writes and rejects conflicting or corrupt existing intents', async () => {
  const item = intent(),
    key = `intents/${item.id}.enc`;
  try {
    await Promise.all([
      persistPurgeIntent(env.PURGE_LEDGER, secret, item),
      persistPurgeIntent(env.PURGE_LEDGER, secret, item),
    ]);
    const first = await env.PURGE_LEDGER.get(key);
    if (!first) throw Error('Missing durable intent');
    const bytes = await first.text();
    expect(await openPurgeIntent(bytes, secret, item.id)).toEqual(item);
    await persistPurgeIntent(env.PURGE_LEDGER, secret, item);
    expect(await (await env.PURGE_LEDGER.get(key))?.text()).toBe(bytes);
    await expect(
      persistPurgeIntent(env.PURGE_LEDGER, secret, {
        ...item,
        targetId: crypto.randomUUID(),
      }),
    ).rejects.toThrow('PURGE_LEDGER_CONFLICT');
    await env.PURGE_LEDGER.put(key, 'corrupt');
    await expect(
      persistPurgeIntent(env.PURGE_LEDGER, secret, item),
    ).rejects.toThrow('INVALID_PURGE_LEDGER');
    await env.PURGE_LEDGER.put(key, 'x'.repeat(4097));
    await expect(
      persistPurgeIntent(env.PURGE_LEDGER, secret, item),
    ).rejects.toThrow('PURGE_LEDGER_CONFLICT');
  } finally {
    await env.PURGE_LEDGER.delete(key);
  }
});
it('recovers a crash after ledger storage without replacing the durable intent', async () => {
  const item = intent(),
    key = `intents/${item.id}.enc`;
  const persist = () => persistPurgeIntent(env.PURGE_LEDGER, secret, item);
  try {
    expect(
      await runPurgeBatch({
        claim: async () => [item],
        persist,
        finalize: async () => {
          throw Error('DB lost');
        },
      }),
    ).toEqual({ claimed: 1, completed: 0, failed: 1 });
    const original = await (await env.PURGE_LEDGER.get(key))?.text();
    expect(original).toBeTruthy();
    expect(
      await runPurgeBatch({
        claim: async () => [item],
        persist,
        finalize: async () => true,
      }),
    ).toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(await (await env.PURGE_LEDGER.get(key))?.text()).toBe(original);
    expect(
      await runPurgeBatch({
        claim: async () => [],
        persist,
        finalize: async () => true,
      }),
    ).toEqual({ claimed: 0, completed: 0, failed: 0 });
  } finally {
    await env.PURGE_LEDGER.delete(key);
  }
});
it('never removes content before its ledger acknowledgment and keeps failures retryable', async () => {
  const items = [intent(), intent(), intent()],
    calls: string[] = [];
  const finalized = vi.fn(async (item) => {
    calls.push(`delete:${item.id}`);
    return item.id !== items[2].id;
  });
  expect(
    await runPurgeBatch({
      claim: async () => items,
      persist: async (item) => {
        calls.push(`ledger:${item.id}`);
        if (item.id === items[1].id) throw Error('R2 unavailable');
      },
      finalize: finalized,
    }),
  ).toEqual({ claimed: 3, completed: 1, failed: 2 });
  expect(calls).toEqual([
    `ledger:${items[0].id}`,
    `delete:${items[0].id}`,
    `ledger:${items[1].id}`,
    `ledger:${items[2].id}`,
    `delete:${items[2].id}`,
  ]);
  expect(finalized).toHaveBeenCalledTimes(2);
  await expect(
    runPurgeBatch({
      claim: async () => Array.from({ length: 21 }, intent),
      persist: async () => {},
      finalize: finalized,
    }),
  ).rejects.toThrow();
  await expect(
    runPurgeBatch({
      claim: async () => {
        throw Error('DB unavailable');
      },
      persist: async () => {},
      finalize: finalized,
    }),
  ).rejects.toThrow('DB unavailable');
});
