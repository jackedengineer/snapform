import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sealPurgeIntent } from '../packages/contracts/src/purge.ts';
import { loadMigrationPlan } from './restore-migrations.mjs';
import { verifyRestoredLedger } from './restore-ledger.mjs';
const secret = Buffer.alloc(32, 11).toString('base64');
const item = () => ({
  id: randomUUID(),
  workspaceId: randomUUID(),
  kind: 'response',
  targetId: randomUUID(),
  reason: 'expired',
  createdAt: '2026-01-01T00:00:00.000Z',
});
async function sqlFixture(pending = []) {
  const plan = await loadMigrationPlan(),
    calls = [];
  return {
    calls,
    executeSql: async (query) => {
      calls.push(query);
      if (query.includes('drizzle.__drizzle_migrations'))
        return JSON.stringify(
          plan.map((row) => ({ hash: row.hash, when: String(row.when) })),
        );
      if (query.includes('json_agg')) return JSON.stringify(pending);
      if (query.includes('SNAPFORM_PURGE_APPLIED'))
        return 'SNAPFORM_PURGE_APPLIED';
      if (query.includes('SNAPFORM_RESTORE_QUARANTINED'))
        return 'SNAPFORM_RESTORE_QUARANTINED';
      throw Error('Unexpected SQL operation');
    },
  };
}
async function object(value) {
  return {
    key: `intents/${value.id}.enc`,
    body: await sealPurgeIntent(value, secret),
  };
}
test('requires retained authenticated objects for SQL-pending intents before any SQL purge', async () => {
  const fixture = await sqlFixture([item()]);
  await assert.rejects(
    verifyRestoredLedger({ ...fixture, objects: [], secret }),
    /PURGE_REPLAY_FAILED/,
  );
  assert.equal(
    fixture.calls.some((query) => query.includes('DO $replay$')),
    false,
  );
  assert.equal(
    fixture.calls.some((query) => query.includes('DELETE FROM public.session')),
    false,
  );
});
test('authenticates every listed object before SQL mutations, then quarantines the copy', async () => {
  const first = item(),
    second = item(),
    fixture = await sqlFixture([first]);
  const result = await verifyRestoredLedger({
    ...fixture,
    objects: [await object(first), await object(second)],
    secret,
  });
  assert.equal(result.replayed, 2);
  assert.equal(result.purgeReplay, 'authenticated');
  assert.equal(result.quarantined, true);
  assert.equal(result.trafficSafe, false);
  assert.equal(
    fixture.calls.filter((query) => query.includes('DO $replay$')).length,
    2,
  );
  assert.match(fixture.calls.at(-1), /SNAPFORM_RESTORE_QUARANTINED/);
  const refused = await sqlFixture([first]);
  await assert.rejects(
    verifyRestoredLedger({
      ...refused,
      objects: [
        await object(first),
        { key: `intents/${randomUUID()}.enc`, body: 'altered' },
      ],
      secret,
    }),
    /PURGE_REPLAY_FAILED/,
  );
  assert.equal(
    refused.calls.some((query) => query.includes('DO $replay$')),
    false,
  );
});
test('an empty remote ledger is valid only with no pending SQL intents', async () => {
  const fixture = await sqlFixture();
  const result = await verifyRestoredLedger({
    ...fixture,
    objects: [],
    secret,
  });
  assert.equal(result.replayed, 0);
  assert.equal(result.quarantined, true);
  assert.equal(result.trafficSafe, false);
});
test('a later remote read failure prevents all SQL replay and quarantine', async () => {
  const first = item(),
    fixture = await sqlFixture([first]);
  async function* interrupted() {
    yield await object(first);
    throw Error('private provider detail');
  }
  await assert.rejects(
    verifyRestoredLedger({ ...fixture, objects: interrupted(), secret }),
    (error) => error.message === 'PURGE_REPLAY_FAILED',
  );
  assert.equal(
    fixture.calls.some((query) => query.includes('DO $replay$')),
    false,
  );
  assert.equal(
    fixture.calls.some((query) => query.includes('DELETE FROM public.session')),
    false,
  );
});
