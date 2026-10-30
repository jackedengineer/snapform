import { and, eq, sql } from 'drizzle-orm';
import {
  retentionInputSchema,
  retentionSettingsSchema,
} from '@snapform/contracts/retention';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { workspaceRetention } from './retention-schema.ts';
const projection = {
  days: workspaceRetention.days,
  revision: workspaceRetention.revision,
  updatedAt: workspaceRetention.updatedAt,
};
export async function getWorkspaceRetention(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
) {
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'responses.read',
    async (tx, role) => {
      const [row] = await tx
        .select(projection)
        .from(workspaceRetention)
        .where(eq(workspaceRetention.workspaceId, workspaceId));
      return retentionSettingsSchema.parse({
        workspaceId,
        role,
        days: row?.days ?? 90,
        revision: row?.revision ?? 0,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      });
    },
  );
}
export async function saveWorkspaceRetention(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  raw: unknown,
) {
  const input = retentionInputSchema.parse(raw);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'workspace.delete',
    async (tx, role) => {
      const values = {
        days: input.days,
        updatedBy: actor,
        updatedAt: sql`statement_timestamp()`,
      };
      const rows =
        input.expectedRevision === 0
          ? await tx
              .insert(workspaceRetention)
              .values({ workspaceId, ...values })
              .onConflictDoNothing()
              .returning(projection)
          : await tx
              .update(workspaceRetention)
              .set({
                ...values,
                revision: sql`${workspaceRetention.revision}+1`,
              })
              .where(
                and(
                  eq(workspaceRetention.workspaceId, workspaceId),
                  eq(workspaceRetention.revision, input.expectedRevision),
                ),
              )
              .returning(projection);
      const row = rows[0];
      if (!row) throw Error('RETENTION_CONFLICT');
      return retentionSettingsSchema.parse({
        workspaceId,
        role,
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  );
}
