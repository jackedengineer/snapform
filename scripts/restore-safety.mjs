import { purgeIntentSchema } from '../packages/contracts/src/purge.ts';

// Only the isolated restore runner supplies this SQL capability. No connection
// URL, runtime credential or production database is accepted by these helpers.
export async function readRestoredPendingIntents(executeSql) {
  try {
    const output = await executeSql(`
SELECT coalesce(json_agg(json_build_object('id',id,'workspaceId',workspace_id,
 'kind',kind,'targetId',target_id,'reason',reason,
 'createdAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY created_at,id),'[]')
FROM (SELECT * FROM public.purge_intent WHERE completed_at IS NULL ORDER BY created_at,id LIMIT 10001) p;`);
    if (Buffer.byteLength(output) > 4 * 1024 * 1024) throw Error();
    const rows = JSON.parse(output.trim());
    if (!Array.isArray(rows) || rows.length > 10000) throw Error();
    return rows.map((row) => purgeIntentSchema.parse(row));
  } catch {
    throw Error('RESTORE_PENDING_INVALID');
  }
}

export async function applyRestoredPurgeIntent(executeSql, raw) {
  try {
    const item = purgeIntentSchema.parse(raw);
    // All interpolated values have closed grammars. psql accepts SQL through
    // stdin; never put metadata, credential material or answer content in argv.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.createdAt))
      throw Error();
    const { id, workspaceId, kind, targetId, reason, createdAt } = item;
    const output = await executeSql(`BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL ROLE snapform_owner;
DO $replay$
DECLARE matched boolean;
BEGIN
 INSERT INTO public.purge_intent(id,workspace_id,kind,target_id,reason,created_at)
 VALUES('${id}','${workspaceId}','${kind}','${targetId}','${reason}','${createdAt}') ON CONFLICT DO NOTHING;
 SELECT workspace_id='${workspaceId}'::uuid AND kind='${kind}' AND target_id='${targetId}'::uuid
  AND reason='${reason}' AND date_trunc('milliseconds',created_at)='${createdAt}'::timestamptz
 INTO matched FROM public.purge_intent WHERE id='${id}' FOR UPDATE;
 IF matched IS DISTINCT FROM true THEN RAISE EXCEPTION 'RESTORE_INTENT_CONFLICT'; END IF;
 IF '${kind}'='response' AND EXISTS(SELECT 1 FROM public.response_session WHERE id='${targetId}' AND workspace_id<>'${workspaceId}')
 THEN RAISE EXCEPTION 'RESTORE_TARGET_CONFLICT'; END IF;
 IF public.finalize_${kind}_purge('${id}') IS DISTINCT FROM true THEN RAISE EXCEPTION 'RESTORE_PURGE_REJECTED'; END IF;
 IF EXISTS(SELECT 1 FROM public.${kind === 'workspace' ? 'workspace' : 'response_session'} WHERE id='${targetId}')
 THEN RAISE EXCEPTION 'RESTORE_TARGET_REMAINS'; END IF;
END $replay$;
SELECT 'SNAPFORM_PURGE_APPLIED';
COMMIT;`);
    if (!output.trim().split('\n').includes('SNAPFORM_PURGE_APPLIED'))
      throw Error();
    return true;
  } catch {
    throw Error('RESTORE_PURGE_FAILED');
  }
}

export async function quarantineRestoredCopy(executeSql) {
  try {
    const output = await executeSql(`BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL ROLE snapform_owner;
DO $quarantine$
BEGIN
 IF EXISTS(SELECT 1 FROM public.purge_intent WHERE completed_at IS NULL)
 THEN RAISE EXCEPTION 'RESTORE_PENDING_PURGE'; END IF;
END $quarantine$;
DELETE FROM public.session;
DELETE FROM public.verification;
UPDATE public.account SET access_token=NULL,refresh_token=NULL,id_token=NULL,
 access_token_expires_at=NULL,refresh_token_expires_at=NULL;
UPDATE public.response_session SET capability_hash=encode(sha256(gen_random_uuid()::text::bytea),'hex');
UPDATE public.response_outbox SET completed_at=coalesce(completed_at,clock_timestamp()),lease_token=NULL,lease_until=NULL;
UPDATE public.response_email_delivery SET status='cancelled',reason='disabled',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
 WHERE status IN('pending','sending','needs_action');
UPDATE public.webhook_delivery SET status='cancelled',reason='disabled',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
 WHERE status IN('pending','sending','needs_action','unknown');
SELECT 'SNAPFORM_RESTORE_QUARANTINED';
COMMIT;`);
    if (!output.trim().split('\n').includes('SNAPFORM_RESTORE_QUARANTINED'))
      throw Error();
    return true;
  } catch {
    throw Error('RESTORE_QUARANTINE_FAILED');
  }
}
