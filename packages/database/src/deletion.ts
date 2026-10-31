import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  deletionInputSchema,
  cancelDeletionSchema,
  deletionRequestSchema,
  deletionTargetSchema,
} from '@snapform/contracts/deletion';
import type { DeletionTarget } from '@snapform/contracts/deletion';
import type { Database, Transaction } from './client.ts';
const errors = new Set([
  'WORKSPACE_NOT_FOUND',
  'FORBIDDEN',
  'DELETION_NOT_FOUND',
  'RESPONSE_NOT_FOUND',
  'DELETION_CONFLICT',
  'INVALID_DELETION_CONFIRMATION',
  'WORKSPACE_DELETION_PENDING',
]);
const dates = new Set(['requestedAt', 'notBefore', 'cancelledAt', 'deletedAt']);
async function receipt(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  query: SQL,
) {
  const id = deletionRequestSchema.shape.workspaceId.parse(workspaceId);
  return db.transaction(async (tx) => {
    // These functions authorize real membership themselves; role GUCs grant nothing.
    await tx.execute(
      sql`select set_config('snapform.user_id',${actor},true),set_config('snapform.workspace_id',${id},true),set_config('snapform.role','',true)`,
    );
    let raw: unknown;
    try {
      raw = (await tx.execute<{ receipt: unknown }>(query)).rows[0]?.receipt;
    } catch (error) {
      const code =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : '';
      if (errors.has(code)) throw Error(code, { cause: error });
      throw error;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw Error('INVALID_DELETION_RECEIPT');
    return deletionRequestSchema.parse(
      Object.fromEntries(
        Object.entries(raw).map(([name, value]) => [
          name,
          dates.has(name) &&
          typeof value === 'string' &&
          Number.isFinite(Date.parse(value))
            ? new Date(value).toISOString()
            : value,
        ]),
      ),
    );
  });
}
export async function scheduleDeletion(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  target: DeletionTarget,
  raw: unknown,
) {
  const input = deletionInputSchema.parse(raw),
    checked = deletionTargetSchema.parse(target);
  return receipt(
    db,
    actor,
    workspaceId,
    sql`select public.schedule_deletion(${input.requestId}::uuid,${workspaceId}::uuid,${checked.kind},${checked.targetId}::uuid,${input.confirmation},${input.acknowledgeDeletion}) as receipt`,
  );
}
export async function readDeletion(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  id: string,
) {
  id = deletionRequestSchema.shape.id.parse(id);
  return receipt(
    db,
    actor,
    workspaceId,
    sql`select public.read_deletion(${workspaceId}::uuid,${id}::uuid) as receipt`,
  );
}
export async function cancelDeletion(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  id: string,
  raw: unknown,
) {
  id = deletionRequestSchema.shape.id.parse(id);
  const input = cancelDeletionSchema.parse(raw);
  return receipt(
    db,
    actor,
    workspaceId,
    sql`select public.cancel_deletion(${workspaceId}::uuid,${id}::uuid,${input.expectedRevision}) as receipt`,
  );
}
