// Runs only through the disposable, network-none restore runner. Never opens Neon.
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyIsolatedRestore } from './restore-postgres.mjs';

export async function inspectEmailSendLock({ executeSql }) {
  const [actor, workspace, form, version, response, token] = Array.from(
    { length: 6 },
    () => randomUUID(),
  );
  const schema = 'email_lock_' + randomUUID().replaceAll('-', '');
  const key = randomInt(100000, 2000000000);
  const sql = (query) =>
    executeSql(
      `SET statement_timeout='25s'; SET lock_timeout='20s';\n${query}`,
    );
  const last = (value) => value.trim().split('\n').at(-1);
  async function until(query) {
    const deadline = Date.now() + 15000;
    while (last(await sql(query)) !== 't') {
      if (Date.now() > deadline) throw Error('EMAIL_LOCK_COORDINATION_TIMEOUT');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  await sql(`CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.release(ready boolean);
    INSERT INTO public."user"(id,name,email,email_verified) VALUES('${actor}','Email lock QA','${actor}@example.invalid',true);
    INSERT INTO public.workspace(id,name,segment,created_by) VALUES('${workspace}','Email lock QA','agency','${actor}');
    INSERT INTO public.membership(workspace_id,user_id,role) VALUES('${workspace}','${actor}','owner');
    INSERT INTO public.form(id,workspace_id,created_by) VALUES('${form}','${workspace}','${actor}');
    INSERT INTO public.form_version(id,workspace_id,form_id,number,source_revision,definition,created_by)
      VALUES('${version}','${workspace}','${form}',1,1,'{"contractVersion":1}','${actor}');
    INSERT INTO public.form_email_settings(workspace_id,form_id,enabled,updated_by) VALUES('${workspace}','${form}',true,'${actor}');
    INSERT INTO public.response_session(id,workspace_id,form_id,version_id,capability_hash,expires_at,reservation_until)
      VALUES('${response}','${workspace}','${form}','${version}','${'a'.repeat(64)}',now()+interval '7 days',now()+interval '7 days');
    UPDATE public.response_session SET status='submitted',submitted_at=now(),ending_id='${version}' WHERE id='${response}';
    UPDATE public.response_email_delivery SET status='sending',first_attempt_at=now(),lease_token='${token}',lease_until=clock_timestamp()+interval '5 seconds'
      WHERE session_id='${response}';`);
  const delivery = last(
    await sql(
      `SELECT id FROM public.response_email_delivery WHERE session_id='${response}';`,
    ),
  );
  assert.match(delivery, /^[0-9a-f-]{36}$/);
  // Hold an unchanged row, so PostgreSQL cannot rely on an updated-tuple recheck.
  const holder = sql(`BEGIN;
    SELECT id FROM public.response_email_delivery WHERE session_id='${response}' FOR UPDATE;
    SELECT pg_advisory_lock(${key});
    DO $$ DECLARE deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN
      WHILE NOT EXISTS(SELECT 1 FROM ${schema}.release) LOOP
        IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'EMAIL_LOCK_GATE_TIMEOUT'; END IF;
        PERFORM pg_sleep(0.025);
      END LOOP;
    END $$;
    COMMIT; SELECT pg_advisory_unlock(${key});`);
  holder.catch(() => {}); // Always awaited below, including coordination failure.
  let preparation;
  try {
    await until(
      `SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=${key} AND granted);`,
    );
    assert.equal(
      last(
        await sql(
          `SELECT lease_until>clock_timestamp() FROM public.response_email_delivery WHERE session_id='${response}';`,
        ),
      ),
      't',
    );
    preparation = sql(`SET application_name='${schema}'; SET ROLE snapform_jobs;
      SELECT public.prepare_owner_email('${delivery}','${token}');`);
    preparation.catch(() => {});
    await until(
      `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${schema}' AND wait_event_type='Lock');`,
    );
    await until(
      `SELECT lease_until<=clock_timestamp() FROM public.response_email_delivery WHERE session_id='${response}';`,
    );
  } finally {
    await sql(`INSERT INTO ${schema}.release VALUES(true);`);
    await holder;
  }
  assert(preparation);
  assert.equal(
    last(await preparation),
    'f',
    'lease must be checked after delivery-row lock wait',
  );
  return { expiredLeaseDenied: true };
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
      inspect: async ({ executeSql }) => {
        const exists = await executeSql(
          "SELECT to_regprocedure('public.prepare_owner_email(uuid,uuid)') IS NOT NULL;",
        );
        if (exists.trim() === 'f') {
          const migration = await readFile(
            new URL(
              '../packages/database/migrations/0036_email-send-guard.sql',
              import.meta.url,
            ),
            'utf8',
          );
          await executeSql(
            'BEGIN; SET LOCAL ROLE snapform_owner;\n' +
              migration.replaceAll('--> statement-breakpoint', '\n') +
              '\nCOMMIT;',
          );
        }
        await inspectEmailSendLock({ executeSql });
      },
    });
    console.log(
      JSON.stringify({
        event: 'isolated_email_lease_verified',
        cleanupCompleted: true,
      }),
    );
  } catch {
    console.error(JSON.stringify({ event: 'isolated_email_lease_failed' }));
    process.exitCode = 1;
  }
}
