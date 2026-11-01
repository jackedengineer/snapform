import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  readRestoredPendingIntents,
  applyRestoredPurgeIntent,
  quarantineRestoredCopy,
} from './restore-safety.mjs';

const intent = () => ({
  id: randomUUID(),
  workspaceId: randomUUID(),
  kind: 'response',
  targetId: randomUUID(),
  reason: 'expired',
  createdAt: '2026-10-31T12:00:00.000Z',
});
test('reads only bounded strict metadata, rejecting extra fields and malformed output', async () => {
  const item = intent();
  assert.deepEqual(
    await readRestoredPendingIntents(async () => JSON.stringify([item])),
    [item],
  );
  for (const output of [
    '{}',
    'not JSON',
    JSON.stringify([{ ...item, answers: {} }]),
    JSON.stringify(Array.from({ length: 10001 }, () => item)),
    ' '.repeat(4 * 1024 * 1024 + 1),
  ])
    await assert.rejects(
      readRestoredPendingIntents(async () => output),
      /RESTORE_PENDING_INVALID/,
    );
});
test('refuses malformed intent before SQL and requires explicit transactional acknowledgement', async () => {
  const queries = [];
  const executeSql = async (query) => {
    queries.push(query);
    return 'BEGIN\nDO\nCOMMIT\n';
  };
  await assert.rejects(
    applyRestoredPurgeIntent(executeSql, { ...intent(), id: "';SELECT 1;--" }),
    /RESTORE_PURGE_FAILED/,
  );
  assert.equal(queries.length, 0);
  await assert.rejects(
    applyRestoredPurgeIntent(executeSql, intent()),
    /RESTORE_PURGE_FAILED/,
  );
  assert.match(queries[0], /^BEGIN;/);
  assert.match(queries[0], /date_trunc\('milliseconds'/);
  assert.match(queries[0], /finalize_response_purge/);
  assert.match(queries[0], /RESTORE_TARGET_REMAINS/);
  const workspaceId = randomUUID();
  assert.equal(
    await applyRestoredPurgeIntent(
      async (query) => {
        assert.match(query, /finalize_workspace_purge/);
        return 'DO\nSNAPFORM_PURGE_APPLIED\nCOMMIT';
      },
      {
        ...intent(),
        kind: 'workspace',
        reason: 'owner',
        workspaceId,
        targetId: workspaceId,
      },
    ),
    true,
  );
});
test('quarantine refuses a missing acknowledgement and sanitizes SQL failures', async () => {
  await assert.rejects(
    quarantineRestoredCopy(async () => ''),
    /RESTORE_QUARANTINE_FAILED/,
  );
  await assert.rejects(
    quarantineRestoredCopy(async () => {
      throw Error('private provider detail');
    }),
    (error) => error.message === 'RESTORE_QUARANTINE_FAILED',
  );
  assert.equal(
    await quarantineRestoredCopy(async () => 'SNAPFORM_RESTORE_QUARANTINED'),
    true,
  );
});
