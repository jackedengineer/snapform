import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
if (!process.env.DATABASE_MIGRATION_URL)
  throw Error('Private operator configuration required');
const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL);
const rollback = Error('Rollback deadline fixture'),
  actor = crypto.randomUUID(),
  workspaceId = crypto.randomUUID();
let stage = 'migration';
let introduced = false;
try {
  try {
    await db.transaction(async (tx) => {
      const exists = await tx.execute(
        sql`select to_regclass('public.deletion_request') is not null as present`,
      );
      if (!exists.rows[0]?.present) {
        introduced = true;
        const migration = await readFile(
          new URL('../migrations/0031_daily_vivisector.sql', import.meta.url),
          'utf8',
        );
        for (const [index, statement] of migration
          .split('--> statement-breakpoint')
          .entries())
          if (statement.trim()) {
            stage = `migration-${index}`;
            await tx.execute(sql.raw(statement));
          }
      }
      stage = 'fixture';
      await tx.insert(user).values({
        id: actor,
        name: 'Deadline QA',
        email: `${actor}@example.invalid`,
        emailVerified: true,
      });
      await createWorkspace(tx, actor, {
        id: workspaceId,
        name: 'Deadline QA',
        segment: 'agency',
      });
      const item = { id: crypto.randomUUID() };
      await tx.execute(
        sql`select public.schedule_deletion(${item.id}::uuid,${workspaceId}::uuid,'workspace',${workspaceId}::uuid,'Deadline QA',true)`,
      );
      stage = 'deadline';
      await tx.execute(
        sql`select set_config('snapform.deadline_probe_id',${item.id},true),set_config('snapform.deadline_probe_workspace',${workspaceId},true)`,
      );
      await tx.execute(sql`DO $$
    DECLARE deadline timestamptz:=clock_timestamp()+interval '50 milliseconds'; rejected boolean:=false;
    BEGIN
     UPDATE public.deletion_request SET requested_at=deadline-interval '24 hours',not_before=deadline
      WHERE id=current_setting('snapform.deadline_probe_id')::uuid;
     PERFORM pg_sleep(0.2);
     BEGIN
      PERFORM public.cancel_deletion(current_setting('snapform.deadline_probe_workspace')::uuid,current_setting('snapform.deadline_probe_id')::uuid,1);
     EXCEPTION WHEN raise_exception THEN
      IF SQLERRM='DELETION_CONFLICT' THEN rejected:=true; ELSE RAISE; END IF;
     END;
     IF NOT rejected THEN RAISE EXCEPTION 'CANCELLATION_DEADLINE_NOT_ENFORCED'; END IF;
    END $$`);
      assert.deepEqual(
        (
          await tx.execute(
            sql`select cancelled_at is null as unchanged from public.deletion_request where id=${item.id}::uuid`,
          )
        ).rows,
        [{ unchanged: true }],
      );
      stage = 'rollback';
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.deepEqual(
    (await db.execute(sql`select id from public."user" where id=${actor}`))
      .rows,
    [],
  );
  if (introduced)
    assert.deepEqual(
      (
        await db.execute(
          sql`select to_regclass('public.deletion_request') is null and to_regprocedure('public.cancel_deletion(uuid,uuid,integer)') is null as removed`,
        )
      ).rows,
      [{ removed: true }],
    );
  console.log(
    JSON.stringify({ event: 'deletion_deadline_verified', rolledBack: true }),
  );
} catch (error) {
  const cause = error instanceof Error ? error.cause : undefined;
  const deadlineBug =
    cause instanceof Error &&
    cause.message === 'CANCELLATION_DEADLINE_NOT_ENFORCED';
  const databaseCode =
    cause && typeof cause === 'object' && 'code' in cause
      ? String(cause.code)
      : 'unknown';
  const syntaxPosition =
    databaseCode === '42601' &&
    cause &&
    typeof cause === 'object' &&
    'position' in cause
      ? Number(cause.position)
      : undefined;
  console.error(
    JSON.stringify({
      event: 'deletion_deadline_verification_failed',
      stage,
      deadlineBug,
      databaseCode,
      syntaxPosition,
    }),
  );
  process.exitCode = 1;
} finally {
  await close();
}
