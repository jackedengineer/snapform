import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sealPurgeIntent } from '../packages/contracts/src/purge.ts';
import { replayPurgeIntents } from './purge-replay.mjs';
const secret = Buffer.alloc(32, 9).toString('base64');
const now = Date.parse('2026-11-01T12:00:00.000Z');
function intent(patch = {}) {
  return {
    id: randomUUID(),
    workspaceId: randomUUID(),
    kind: 'response',
    targetId: randomUUID(),
    reason: 'expired',
    createdAt: '2026-10-31T12:00:00.000Z',
    ...patch,
  };
}
async function object(value, key = `intents/${value.id}.enc`) {
  return { key, body: await sealPurgeIntent(value, secret) };
}
test('replays the authenticated union, including old SQL-only pending intents, with workspace deletion first', async () => {
  const old = intent({ createdAt: '2025-01-01T00:00:00.000Z' });
  const response = intent(),
    workspaceId = randomUUID();
  const workspace = intent({
    workspaceId,
    targetId: workspaceId,
    kind: 'workspace',
    reason: 'owner',
  });
  const calls = [];
  const result = await replayPurgeIntents({
    pending: [old],
    objects: [
      await object(response),
      await object(workspace),
      await object(old),
    ],
    secret,
    now,
    persist: async (item) => {
      calls.push(['ledger', item.id]);
      return true;
    },
    apply: async (item) => {
      calls.push(['delete', item.id]);
      return true;
    },
  });
  assert.equal(result.replayed, 3);
  assert.equal(result.authenticatedObjects, 3);
  assert.equal(result.trafficSafe, false);
  assert.deepEqual(calls.slice(0, 2), [
    ['ledger', workspace.id],
    ['delete', workspace.id],
  ]);
  assert.deepEqual(
    new Set(calls.filter(([kind]) => kind === 'delete').map(([, id]) => id)),
    new Set([old.id, response.id, workspace.id]),
  );
  for (let index = 0; index < calls.length; index += 2)
    assert.deepEqual(calls[index], ['ledger', calls[index + 1][1]]);
});
test('validates every retained object before any deletion and rejects conflicting identities or targets', async () => {
  const first = intent(),
    calls = [];
  const operations = {
    secret,
    now,
    persist: async () => {
      calls.push('ledger');
    },
    apply: async () => {
      calls.push('delete');
      return true;
    },
  };
  for (const input of [
    {
      pending: [],
      objects: [
        await object(first),
        { key: `intents/${randomUUID()}.enc`, body: 'corrupt' },
      ],
    },
    {
      pending: [first],
      objects: [await object({ ...first, targetId: randomUUID() })],
    },
    {
      pending: [first],
      objects: [await object({ ...first, id: randomUUID() })],
    },
    { pending: [], objects: [await object(first, '../' + first.id)] },
    { pending: [], objects: [await object(first), await object(first)] },
    {
      pending: [],
      objects: [await object(first)],
      secret: Buffer.alloc(32, 8).toString('base64'),
    },
    {
      pending: [intent({ createdAt: '2027-01-01T00:00:00.000Z' })],
      objects: [],
    },
    { pending: [{ ...first, answers: {} }], objects: [] },
    { pending: Array.from({ length: 10001 }, () => first), objects: [] },
  ])
    await assert.rejects(
      replayPurgeIntents({ ...operations, ...input }),
      /PURGE_REPLAY/,
    );
  assert.deepEqual(calls, []);
  await assert.rejects(
    replayPurgeIntents({
      pending: [first],
      objects: [],
      secret,
      now,
      persist: async () => false,
      apply: async () => {
        calls.push('delete');
        return true;
      },
    }),
    /PURGE_REPLAY/,
  );
  assert.deepEqual(calls, []);
});
test('does not finalize without a durable acknowledgement and stops on a rejected finalizer', async () => {
  const first = intent(),
    second = intent(),
    calls = [];
  await assert.rejects(
    replayPurgeIntents({
      pending: [first],
      objects: [],
      secret,
      now,
      persist: async () => {
        throw Error('Ledger unavailable');
      },
      apply: async () => {
        calls.push('delete');
        return true;
      },
    }),
    /PURGE_REPLAY/,
  );
  assert.deepEqual(calls, []);
  await assert.rejects(
    replayPurgeIntents({
      pending: [first, second],
      objects: [],
      secret,
      now,
      persist: async () => {
        calls.push('ledger');
        return true;
      },
      apply: async () => {
        calls.push('delete');
        return false;
      },
    }),
    /PURGE_REPLAY/,
  );
  assert.deepEqual(calls, ['ledger', 'delete']);
});
