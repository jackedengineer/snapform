// Fixtures and destructive assertions run only inside the isolated restore.
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyIsolatedRestore } from './restore-postgres.mjs';
import { applyCurrentMigrations } from './restore-migrations.mjs';

export async function inspectDeletionMetadata({ executeSql }) {
  await applyCurrentMigrations(executeSql);
  const available = await executeSql(
    "SELECT to_regprocedure('public.prune_deletion_metadata(integer)') IS NOT NULL;",
  );
  if (available.trim().split('\n').at(-1) !== 't')
    throw Error('METADATA_FUNCTION_REQUIRED');
  const workspace = randomUUID(),
    actor = randomUUID();
  const old = randomUUID(),
    recent = randomUUID(),
    pending = randomUUID();
  const oldRequest = randomUUID(),
    recentRequest = randomUUID(),
    waiting = randomUUID();
  const cancelled = randomUUID(),
    recentCancelled = randomUUID();
  const liveWorkspace = randomUUID(),
    liveIntent = randomUUID(),
    unsent = randomUUID();
  await executeSql(`BEGIN;
INSERT INTO public."user"(id,name,email,email_verified) VALUES('${actor}','Metadata QA','${actor}@example.invalid',true);
INSERT INTO public.workspace(id,name,segment,created_by) VALUES('${liveWorkspace}','Metadata QA','agency','${actor}');
INSERT INTO public.purge_intent(id,workspace_id,kind,target_id,reason,created_at,completed_at)
 VALUES('${liveIntent}','${liveWorkspace}','workspace','${liveWorkspace}','owner',now()-interval '130 days',now()-interval '91 days');
INSERT INTO public.purge_intent(id,workspace_id,kind,target_id,reason,created_at,completed_at) VALUES
 ('${old}','${workspace}','response','${randomUUID()}','owner',now()-interval '130 days',now()-interval '91 days'),
 ('${recent}','${workspace}','response','${randomUUID()}','owner',now()-interval '130 days',now()-interval '89 days'),
 ('${pending}','${workspace}','response','${randomUUID()}','owner',now()-interval '130 days',NULL);
INSERT INTO public.deletion_request(id,workspace_id,kind,target_id,requested_by,requested_at,not_before,purge_id)
 SELECT CASE id WHEN '${old}' THEN '${oldRequest}'::uuid WHEN '${recent}' THEN '${recentRequest}'::uuid ELSE '${waiting}'::uuid END,
 workspace_id,kind,target_id,'${actor}',now()-interval '132 days',now()-interval '131 days',id
 FROM public.purge_intent WHERE workspace_id='${workspace}';
INSERT INTO public.deletion_request(id,workspace_id,kind,target_id,requested_by,requested_at,not_before,cancelled_at,cancelled_by) VALUES
 ('${cancelled}','${workspace}','response','${randomUUID()}','${actor}',now()-interval '91 days 1 hour',now()-interval '90 days 1 hour',now()-interval '91 days','${actor}'),
 ('${recentCancelled}','${workspace}','response','${randomUUID()}','${actor}',now()-interval '89 days 1 hour',now()-interval '88 days 1 hour',now()-interval '89 days','${actor}'),
 ('${randomUUID()}','${workspace}','response','${randomUUID()}','${actor}',now()-interval '200 days 1 hour',now()-interval '199 days 1 hour',now()-interval '200 days','${actor}'),
 ('${randomUUID()}','${workspace}','response','${randomUUID()}','${actor}',now()-interval '200 days 1 hour',now()-interval '199 days 1 hour',now()-interval '200 days','${actor}');
INSERT INTO public.deletion_request(id,workspace_id,kind,target_id,requested_by,requested_at,not_before)
 VALUES('${unsent}','${workspace}','response','${randomUUID()}','${actor}',now()-interval '132 days',now()-interval '131 days');
DO $checks$
DECLARE counts record; iterations integer; drained boolean:=false;
BEGIN
 SELECT count(*)::integer+1 INTO iterations FROM (
  SELECT id FROM public.deletion_request UNION ALL SELECT id FROM public.purge_intent
 ) metadata;
 IF iterations>10000 THEN RAISE EXCEPTION 'METADATA_DRILL_TOO_LARGE'; END IF;
 SET LOCAL ROLE snapform_jobs;
 FOR n IN 1..iterations LOOP
  SELECT * INTO counts FROM public.prune_deletion_metadata(1);
  IF counts.requests_deleted NOT BETWEEN 0 AND 1 OR counts.intents_deleted NOT BETWEEN 0 AND 1 THEN
   RAISE EXCEPTION 'METADATA_BATCH_BOUND_FAILED';
  END IF;
  IF counts.requests_deleted=0 AND counts.intents_deleted=0 THEN drained:=true; EXIT; END IF;
 END LOOP;
 IF NOT drained THEN RAISE EXCEPTION 'METADATA_DRILL_NOT_DRAINED'; END IF;
END $checks$;
RESET ROLE;
DO $checks$ BEGIN
 IF EXISTS(SELECT 1 FROM public.deletion_request WHERE id IN('${oldRequest}','${cancelled}'))
  OR EXISTS(SELECT 1 FROM public.purge_intent WHERE id='${old}')
  OR (SELECT count(*) FROM public.purge_intent WHERE id IN('${recent}','${pending}'))<>2
  OR (SELECT count(*) FROM public.deletion_request WHERE id IN('${recentRequest}','${recentCancelled}','${waiting}'))<>3
  OR NOT EXISTS(SELECT 1 FROM public.deletion_request WHERE id='${unsent}')
  OR NOT EXISTS(SELECT 1 FROM public.purge_intent WHERE id='${liveIntent}')
 THEN RAISE EXCEPTION 'METADATA_RETENTION_FAILED'; END IF;
 IF has_function_privilege('snapform_runtime','public.prune_deletion_metadata(integer)','EXECUTE')
  OR has_table_privilege('snapform_jobs','public.purge_intent','DELETE')
  OR has_table_privilege('snapform_jobs','public.deletion_request','DELETE')
 THEN RAISE EXCEPTION 'METADATA_PRIVILEGE_FAILED'; END IF;
END $checks$;
SET LOCAL ROLE snapform_jobs;
DO $checks$ DECLARE counts record; n integer; BEGIN
 FOREACH n IN ARRAY ARRAY[0,101,NULL] LOOP
  SELECT * INTO counts FROM public.prune_deletion_metadata(n);
  IF counts.requests_deleted<>0 OR counts.intents_deleted<>0 THEN RAISE EXCEPTION 'INVALID_BATCH_ACCEPTED'; END IF;
 END LOOP;
END $checks$;
ROLLBACK;`);
  return {
    bounded: true,
    pendingPreserved: true,
    recentPreserved: true,
    jobsOnly: true,
    liveTargetPreserved: true,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let missingFunction = false;
  try {
    let metadata;
    const result = await verifyIsolatedRestore({
      manifestPath: resolve(process.argv[2]),
      secret: process.env.BACKUP_ENCRYPTION_KEY,
      workDirectory: '.recovery',
      inspect: async (context) => {
        try {
          metadata = await inspectDeletionMetadata(context);
        } catch (error) {
          missingFunction =
            error instanceof Error &&
            error.message === 'METADATA_FUNCTION_REQUIRED';
          throw error;
        }
      },
    });
    console.log(
      JSON.stringify({
        event: 'isolated_deletion_metadata_verified',
        migrations: result.migrations,
        ...metadata,
        cleanupCompleted: true,
      }),
    );
  } catch {
    console.error(
      JSON.stringify({
        event: 'isolated_deletion_metadata_failed',
        missingFunction,
      }),
    );
    process.exitCode = 1;
  }
}
