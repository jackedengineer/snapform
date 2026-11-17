import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { purgeIntentSchema, purgeBatchSchema } from '@snapform/contracts/purge';
import type { PurgeIntent } from '@snapform/contracts/purge';
import type { Database, Transaction } from './client.ts';
async function readIntents(
  db: Database | Transaction,
  query: SQL,
): Promise<PurgeIntent[]> {
  const { rows } = await db.execute<{
    id: string;
    workspace_id: string;
    kind: string;
    target_id: string;
    reason: string;
    created_at: Date | string;
  }>(query);
  return purgeBatchSchema.parse(
    rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      kind: row.kind,
      targetId: row.target_id,
      reason: row.reason,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  );
}
export function claimExpiredResponses(
  db: Database | Transaction,
  workspaceId?: string,
) {
  return readIntents(
    db,
    sql`select * from public.claim_expired_responses(20,${workspaceId ?? null}::uuid)`,
  );
}
export function claimOwnerDeletions(
  db: Database | Transaction,
  workspaceId?: string,
) {
  return readIntents(
    db,
    sql`select * from public.claim_owner_deletions(20,${workspaceId ?? null}::uuid)`,
  );
}
/**
 * The upload key prefix to empty before finalizing an intent (migration 0046):
 * workspace/ or workspace/form/session/. null when nothing can remain.
 */
export async function purgeFilePrefix(
  db: Database | Transaction,
  raw: PurgeIntent,
): Promise<string | null> {
  const intent = purgeIntentSchema.parse(raw);
  const { rows } = await db.execute<{ prefix: string | null }>(
    sql`select public.purge_file_prefix(${intent.id}::uuid) as prefix`,
  );
  const prefix = rows[0]?.prefix ?? null;
  const expected =
    intent.kind === 'workspace'
      ? `${intent.workspaceId}/`
      : new RegExp(`^${intent.workspaceId}/[0-9a-f-]{36}/${intent.targetId}/$`);
  if (
    prefix !== null &&
    (typeof expected === 'string'
      ? prefix !== expected
      : !expected.test(prefix))
  )
    throw Error('Invalid purge file prefix');
  return prefix;
}
// Only trusted Jobs code can execute this after the R2 ledger acknowledgment.
export async function finalizeResponsePurge(
  db: Database | Transaction,
  raw: PurgeIntent,
): Promise<boolean> {
  const intent = purgeIntentSchema.parse(raw);
  const { rows } = await db.execute<{ completed: boolean }>(
    sql`select public.finalize_response_purge(${intent.id}::uuid) as completed`,
  );
  if (typeof rows[0]?.completed !== 'boolean')
    throw Error('Invalid purge receipt');
  return rows[0].completed;
}
export async function finalizeWorkspacePurge(
  db: Database | Transaction,
  raw: PurgeIntent,
): Promise<boolean> {
  const intent = purgeIntentSchema.parse(raw);
  if (intent.kind !== 'workspace') throw Error('INVALID_PURGE_TARGET');
  const { rows } = await db.execute<{ completed: boolean }>(
    sql`select public.finalize_workspace_purge(${intent.id}::uuid) as completed`,
  );
  if (typeof rows[0]?.completed !== 'boolean')
    throw Error('Invalid purge receipt');
  return rows[0].completed;
}
export async function pruneDeletionMetadata(db: Database | Transaction) {
  const { rows } = await db.execute<{
    requests_deleted: number;
    intents_deleted: number;
  }>(sql`select * from public.prune_deletion_metadata(100)`);
  const result = rows[0];
  if (
    rows.length !== 1 ||
    !result ||
    ![result.requests_deleted, result.intents_deleted].every(
      (value) => Number.isSafeInteger(value) && value >= 0 && value <= 100,
    )
  )
    throw Error('Invalid metadata cleanup receipt');
  return {
    requestsDeleted: result.requests_deleted,
    intentsDeleted: result.intents_deleted,
  };
}
