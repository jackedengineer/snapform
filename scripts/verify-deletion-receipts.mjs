// Every fixture belongs to the disposable restore, never shared Neon.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyIsolatedRestore } from './restore-postgres.mjs';
import { applyCurrentMigrations } from './restore-migrations.mjs';

export async function inspectDeletionReceipts({ executeSql }) {
  await applyCurrentMigrations(executeSql);
  const actor = randomUUID(),
    stranger = randomUUID(),
    workspace = randomUUID(),
    request = randomUUID();
  await executeSql(`BEGIN;
INSERT INTO public."user"(id,name,email,email_verified) VALUES
 ('${actor}','Receipt QA','${actor}@example.invalid',true),('${stranger}','Receipt QA','${stranger}@example.invalid',true);
INSERT INTO public.workspace(id,name,segment,created_by) VALUES('${workspace}','Receipt QA','agency','${actor}');
INSERT INTO public.membership(workspace_id,user_id,role) VALUES('${workspace}','${actor}','owner');
INSERT INTO public.deletion_request(id,workspace_id,kind,target_id,requested_by,requested_at,not_before)
 VALUES('${request}','${workspace}','workspace','${workspace}','${actor}',now()-interval '2 days',now()-interval '1 day');
SELECT count(*) FROM public.claim_owner_deletions(20,'${workspace}');
SELECT public.finalize_workspace_purge(purge_id) FROM public.deletion_request WHERE id='${request}';
COMMIT;`);
  const scoped = (id) => `SET ROLE snapform_runtime;
SELECT set_config('snapform.workspace_id','${workspace}',false),set_config('snapform.user_id','${id}',false),set_config('snapform.role','owner',false);`;
  for (const caller of [actor, stranger]) {
    await executeSql(`${scoped(caller)}
DO $regression$ BEGIN
 PERFORM public.find_deletion('${workspace}','workspace','${randomUUID()}');
 RAISE EXCEPTION 'INVALID_TARGET_ACCEPTED';
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM<>'INVALID_DELETION_TARGET' THEN RAISE EXCEPTION 'INVALID_TARGET_NOT_REJECTED'; END IF;
END $regression$;`);
  }
  const output = await executeSql(`${scoped(actor)}
SELECT public.find_deletion('${workspace}','workspace','${workspace}')->>'state';`);
  assert.equal(output.trim().split('\n').at(-1), 'deleted');
  const direct = await executeSql(`${scoped(actor)}
SELECT public.read_deletion('${workspace}','${request}')->>'state';`);
  assert.equal(direct.trim().split('\n').at(-1), 'deleted');
  await assert.rejects(
    executeSql(`${scoped(stranger)}
SELECT public.find_deletion('${workspace}','workspace','${workspace}');`),
  );
  await assert.rejects(
    executeSql(`${scoped(actor)}
SELECT public.cancel_deletion('${workspace}','${request}',1);`),
  );
  await assert.rejects(
    executeSql(`${scoped(actor)}
SELECT * FROM public.deletion_request;`),
  );
  const permissions = await executeSql(
    `SELECT has_function_privilege('snapform_jobs','public.find_deletion(uuid,text,uuid)','EXECUTE');`,
  );
  assert.equal(permissions.trim().split('\n').at(-1), 'f');
  return {
    completionReceipt: true,
    foreignReaderDenied: true,
    cancellationDenied: true,
    directReadDenied: true,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    let receipts;
    const result = await verifyIsolatedRestore({
      manifestPath: resolve(process.argv[2]),
      secret: process.env.BACKUP_ENCRYPTION_KEY,
      workDirectory: '.recovery',
      inspect: async (context) => {
        receipts = await inspectDeletionReceipts(context);
      },
    });
    console.log(
      JSON.stringify({
        event: 'isolated_deletion_receipts_verified',
        migrations: result.migrations,
        ...receipts,
        cleanupCompleted: true,
      }),
    );
  } catch {
    console.error(
      JSON.stringify({ event: 'isolated_deletion_receipts_failed' }),
    );
    process.exitCode = 1;
  }
}
