import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Source-owned files only. The caller's SQL capability belongs to the isolated
// restore runner; no connection URL or migration-owner login is accepted here.
export async function loadMigrationPlan() {
  const directory = new URL(
    '../packages/database/migrations/',
    import.meta.url,
  );
  const journal = JSON.parse(
    await readFile(new URL('meta/_journal.json', directory), 'utf8'),
  );
  if (!Array.isArray(journal.entries) || journal.entries.length > 1000)
    throw Error('RESTORE_MIGRATION_PLAN_INVALID');
  const plan = [];
  for (const [index, item] of journal.entries.entries()) {
    if (
      item.idx !== index ||
      !/^\d{4}_[a-z0-9_-]+$/.test(item.tag) ||
      !Number.isSafeInteger(item.when) ||
      item.when <= 0 ||
      (index > 0 && item.when <= plan[index - 1].when)
    )
      throw Error('RESTORE_MIGRATION_PLAN_INVALID');
    const text = await readFile(new URL(item.tag + '.sql', directory), 'utf8');
    if (Buffer.byteLength(text) > 4 * 1024 * 1024)
      throw Error('RESTORE_MIGRATION_PLAN_INVALID');
    plan.push({
      when: item.when,
      text,
      hash: createHash('sha256').update(text).digest('hex'),
    });
  }
  return plan;
}
export function verifyMigrationPrefix(plan, rows) {
  if (!Array.isArray(rows) || rows.length > plan.length)
    throw Error('RESTORE_MIGRATION_DRIFT');
  for (const [index, row] of rows.entries()) {
    if (
      !row ||
      Object.keys(row).length !== 2 ||
      row.hash !== plan[index].hash ||
      row.when !== String(plan[index].when)
    )
      throw Error('RESTORE_MIGRATION_DRIFT');
  }
  return rows.length;
}
export async function applyCurrentMigrations(executeSql) {
  const plan = await loadMigrationPlan();
  const output = await executeSql(
    "SELECT coalesce(json_agg(json_build_object('hash',hash,'when',created_at::text) ORDER BY created_at),'[]') FROM drizzle.__drizzle_migrations;",
  );
  let rows;
  try {
    if (output.length > 1024 * 1024) throw Error();
    rows = JSON.parse(output.trim().split('\n').at(-1));
  } catch {
    throw Error('RESTORE_MIGRATION_DRIFT');
  }
  const applied = verifyMigrationPrefix(plan, rows);
  if (applied < 31) throw Error('RESTORE_MIGRATION_BASE_UNSUPPORTED');
  for (const migration of plan.slice(applied)) {
    await executeSql(
      `BEGIN;\nSET LOCAL ROLE snapform_owner;\n${migration.text}\nINSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('${migration.hash}',${migration.when});\nCOMMIT;`,
    );
  }
  return { migrations: plan.length, applied: plan.length - applied };
}
