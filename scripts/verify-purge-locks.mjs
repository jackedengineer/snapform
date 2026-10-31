// Operator-only concurrency regression. It never opens a Neon connection: every SQL
// session belongs to the runner's disposable, network-none restored container.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { verifyIsolatedRestore } from './restore-postgres.mjs';

export async function inspectPurgeLocks({ executeSql }) {
  const schema = 'purge_probe_' + randomUUID().replaceAll('-', '');
  const prefix = schema.slice(0, 35);
  const sqlSettings = `SET statement_timeout='12s'; SET lock_timeout='8s'; SET deadlock_timeout='100ms';`;
  const results = {};

  const sql = (text) => executeSql(sqlSettings + '\n' + text);
  const last = (value) => value.trim().split('\n').at(-1);
  async function until(check) {
    const deadline = Date.now() + 6000;
    while (!(await check())) {
      if (Date.now() >= deadline) throw Error('PROBE_COORDINATION_TIMEOUT');
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  async function waiting(application) {
    return (
      last(
        await sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE application_name='${application}' AND wait_event_type='Lock');`),
      ) === 't'
    );
  }
  // A separate session owns the gate until a committed release flag appears.
  // Advisory locks expose readiness through pg_locks without sleep-based races.
  async function gate() {
    const key = randomInt(100000, 2000000000);
    const task =
      sql(`SET statement_timeout='25s'; SELECT pg_advisory_lock(${key});
      DO $$ DECLARE deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN
        WHILE NOT EXISTS(SELECT 1 FROM ${schema}.gates WHERE id=${key}) LOOP
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'PROBE_GATE_TIMEOUT'; END IF;
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $$;
      SELECT pg_advisory_unlock(${key});`);
    task.catch(() => {}); // Awaited below, including on coordination failure.
    await until(
      async () =>
        last(
          await sql(`SELECT EXISTS(SELECT 1 FROM pg_locks
      WHERE locktype='advisory' AND classid=0 AND objid=${key} AND objsubid=1 AND granted);`),
        ) === 't',
    );
    return {
      key,
      async release() {
        await sql(
          `INSERT INTO ${schema}.gates VALUES(${key}) ON CONFLICT DO NOTHING;`,
        );
        await task;
      },
    };
  }
  async function fixture(expired = false) {
    const ids = Object.fromEntries(
      ['actor', 'workspace', 'form', 'version', 'response'].map((key) => [
        key,
        randomUUID(),
      ]),
    );
    const created = expired ? "now()-interval '8 days'" : 'now()';
    const expires = expired
      ? "now()-interval '1 day'"
      : "now()+interval '7 days'";
    await sql(`BEGIN;
      INSERT INTO public."user"(id,name,email,email_verified) VALUES('${ids.actor}','Lock QA','${ids.actor}@example.invalid',true);
      INSERT INTO public.workspace(id,name,segment,created_by) VALUES('${ids.workspace}','Lock QA','agency','${ids.actor}');
      INSERT INTO public.membership(workspace_id,user_id,role) VALUES('${ids.workspace}','${ids.actor}','owner');
      INSERT INTO public.form(id,workspace_id,created_by) VALUES('${ids.form}','${ids.workspace}','${ids.actor}');
      INSERT INTO public.form_version(id,workspace_id,form_id,number,source_revision,definition,created_by)
        VALUES('${ids.version}','${ids.workspace}','${ids.form}',1,1,'{"contractVersion":1}','${ids.actor}');
      INSERT INTO public.response_session(id,workspace_id,form_id,version_id,capability_hash,created_at,expires_at,reservation_until)
        VALUES('${ids.response}','${ids.workspace}','${ids.form}','${ids.version}','${ids.response.replaceAll('-', '').repeat(2)}',${created},${expires},${expires});
      COMMIT;`);
    return ids;
  }
  function scoped(ids) {
    return `SELECT set_config('snapform.user_id','${ids.actor}',false),
      set_config('snapform.workspace_id','${ids.workspace}',false),set_config('snapform.role','',false);`;
  }

  const ddl = await readFile(
    new URL(
      '../packages/database/migrations/0032_owner-purge.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const installed = last(
    await sql(
      "SELECT to_regprocedure('public.claim_owner_deletions(integer,uuid)') IS NOT NULL;",
    ),
  );
  if (installed !== 't')
    await sql(
      'BEGIN;\n' +
        ddl.replaceAll('--> statement-breakpoint', '\n') +
        '\nCOMMIT;',
    );
  await sql(`CREATE SCHEMA ${schema};
    CREATE TABLE ${schema}.gates(id integer PRIMARY KEY);
    CREATE TABLE ${schema}.observations(pending boolean NOT NULL);
    CREATE FUNCTION ${schema}.finalize(kind text, id uuid) RETURNS text
    LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
      IF kind='workspace' THEN PERFORM public.finalize_workspace_purge(id);
      ELSE PERFORM public.finalize_response_purge(id); END IF;
      RETURN 'ok';
    EXCEPTION WHEN deadlock_detected THEN RETURN 'deadlock';
      WHEN lock_not_available THEN RETURN 'lock-timeout';
      WHEN query_canceled THEN RETURN 'statement-timeout'; END $$;`);

  const a = await fixture();
  const responseIntent = randomUUID(),
    workspaceIntent = randomUUID();
  await sql(`INSERT INTO public.purge_intent(id,workspace_id,kind,target_id,reason) VALUES
    ('${responseIntent}','${a.workspace}','response','${a.response}','owner'),
    ('${workspaceIntent}','${a.workspace}','workspace','${a.workspace}','owner');`);
  const firstGate = await gate();
  await sql(`CREATE FUNCTION ${schema}.pause_delete() RETURNS trigger LANGUAGE plpgsql
    SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
      IF OLD.id='${a.response}'::uuid THEN
        PERFORM pg_advisory_xact_lock(${firstGate.key});
      END IF;
      RETURN OLD;
    END $$;
    CREATE TRIGGER private_purge_lock_probe BEFORE DELETE ON public.response_session
      FOR EACH ROW EXECUTE FUNCTION ${schema}.pause_delete();`);
  const workspaceTask = sql(`SET application_name='${prefix}-workspace';
    SELECT ${schema}.finalize('workspace','${workspaceIntent}');`);
  workspaceTask.catch(() => {});
  let responseTask;
  try {
    await until(() => waiting(prefix + '-workspace'));
    responseTask = sql(`SET application_name='${prefix}-response';
      SELECT ${schema}.finalize('response','${responseIntent}');`);
    responseTask.catch(() => {});
    await until(() => waiting(prefix + '-response'));
  } finally {
    await firstGate.release();
  }
  const finalizers = await Promise.allSettled([workspaceTask, responseTask]);
  results.finalizers = finalizers.every(
    (item) => item.status === 'fulfilled' && last(item.value) === 'ok',
  );
  results.deadlockObserved = finalizers.some(
    (item) => item.status === 'fulfilled' && last(item.value) === 'deadlock',
  );
  await sql(
    'DROP TRIGGER private_purge_lock_probe ON public.response_session;',
  );

  const b = await fixture(true);
  const secondGate = await gate();
  await sql(`CREATE FUNCTION ${schema}.pause_expiry() RETURNS trigger LANGUAGE plpgsql
    VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
      IF NEW.workspace_id='${b.workspace}'::uuid AND NEW.reason='expired' THEN
        PERFORM pg_advisory_xact_lock(${secondGate.key});
        INSERT INTO ${schema}.observations SELECT EXISTS(SELECT 1 FROM public.deletion_request
          WHERE workspace_id=NEW.workspace_id AND kind='workspace' AND cancelled_at IS NULL);
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER private_purge_expiry_probe BEFORE INSERT ON public.purge_intent
      FOR EACH ROW EXECUTE FUNCTION ${schema}.pause_expiry();`);
  const expiryTask = sql(`SET application_name='${prefix}-expiry';
    SELECT count(*) FROM public.claim_expired_responses(20,'${b.workspace}');`);
  expiryTask.catch(() => {});
  let scheduleTask,
    scheduled = false;
  try {
    await until(() => waiting(prefix + '-expiry'));
    scheduleTask = sql(`SET application_name='${prefix}-schedule'; ${scoped(b)}
      SELECT public.schedule_deletion('${randomUUID()}','${b.workspace}','workspace','${b.workspace}','Lock QA',true) IS NOT NULL;
    `).finally(() => {
      scheduled = true;
    });
    scheduleTask.catch(() => {});
    await until(async () => scheduled || (await waiting(prefix + '-schedule')));
  } finally {
    await secondGate.release();
  }
  const expiryAndSchedule = await Promise.allSettled([
    expiryTask,
    scheduleTask,
  ]);
  assert.ok(
    expiryAndSchedule.every((item) => item.status === 'fulfilled'),
    'PROBE_OPERATION_FAILED',
  );
  const pending = last(
    await sql(`SELECT pending FROM ${schema}.observations;`),
  );
  assert.ok(pending === 't' || pending === 'f', 'PROBE_OBSERVATION_MISSING');
  results.expirySerialized = pending === 'f';
  results.expiryAfterPendingObserved = pending === 't';
  console.log(
    JSON.stringify({ event: 'isolated_purge_lock_results', ...results }),
  );
  assert.ok(
    results.finalizers && results.expirySerialized,
    'PURGE_LOCK_REGRESSION',
  );
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (!process.env.BACKUP_ENCRYPTION_KEY || !process.argv[2])
      throw Error('RECOVERY_CONFIGURATION_REQUIRED');
    await verifyIsolatedRestore({
      manifestPath: resolve(process.argv[2]),
      secret: process.env.BACKUP_ENCRYPTION_KEY,
      workDirectory: resolve(process.argv[3] || '.recovery'),
      inspect: inspectPurgeLocks,
    });
    console.log(
      JSON.stringify({
        event: 'isolated_purge_locks_verified',
        cleanupCompleted: true,
      }),
    );
  } catch {
    console.error(JSON.stringify({ event: 'isolated_purge_locks_failed' }));
    process.exitCode = 1;
  }
}
