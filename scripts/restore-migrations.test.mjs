import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadMigrationPlan,
  applyCurrentMigrations,
  verifyMigrationPrefix,
} from './restore-migrations.mjs';

test('accepts only an exact ordered prefix of the reviewed source migrations', async () => {
  const plan = await loadMigrationPlan();
  assert.ok(plan.length >= 38);
  const rows = plan
    .slice(0, 32)
    .map((item) => ({ hash: item.hash, when: String(item.when) }));
  assert.equal(verifyMigrationPrefix(plan, rows), 32);
  for (const changed of [
    [{ ...rows[0], hash: '0'.repeat(64) }, ...rows.slice(1)],
    [{ ...rows[0], when: '1' }, ...rows.slice(1)],
    [...rows.slice(1), rows[0]],
    [
      ...plan.map((item) => ({ hash: item.hash, when: String(item.when) })),
      rows[0],
    ],
  ])
    assert.throws(
      () => verifyMigrationPrefix(plan, changed),
      /RESTORE_MIGRATION/,
    );
});
test('refuses drift before applying anything and installs only the missing suffix transactionally', async () => {
  const plan = await loadMigrationPlan(),
    prefix = plan
      .slice(0, 32)
      .map((item) => ({ hash: item.hash, when: String(item.when) }));
  const calls = [];
  const result = await applyCurrentMigrations(async (query) => {
    calls.push(query);
    return calls.length === 1 ? JSON.stringify(prefix) : '';
  });
  assert.equal(result.applied, plan.length - 32);
  assert.equal(result.migrations, plan.length);
  assert.equal(calls.length, 1 + plan.length - 32);
  for (const query of calls.slice(1)) {
    assert.match(query, /^BEGIN;/);
    assert.match(query, /SET LOCAL ROLE snapform_owner;/);
    assert.match(query, /INSERT INTO drizzle\.__drizzle_migrations/);
    assert.match(query, /COMMIT;$/);
  }
  const invalid = [];
  await assert.rejects(
    applyCurrentMigrations(async (query) => {
      invalid.push(query);
      return JSON.stringify([{ hash: '0'.repeat(64), when: '1' }]);
    }),
    /RESTORE_MIGRATION/,
  );
  assert.equal(invalid.length, 1);
});
