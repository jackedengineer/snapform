import { sql } from 'drizzle-orm';
import { purgeIntentSchema, purgeBatchSchema } from '@snapform/contracts/purge';
import type { PurgeIntent } from '@snapform/contracts/purge';
import type { Database, Transaction } from './client.ts';
export async function claimExpiredResponses(
  db: Database | Transaction,
  workspaceId?: string,
): Promise<PurgeIntent[]> {
  const { rows } = await db.execute<{
    id: string;
    workspace_id: string;
    kind: string;
    target_id: string;
    reason: string;
    created_at: Date | string;
  }>(
    sql`select * from public.claim_expired_responses(20,${workspaceId ?? null}::uuid)`,
  );
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
