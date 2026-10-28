import { and, desc, eq, sql } from 'drizzle-orm';
import { can, createWorkspaceSchema } from '@snapform/contracts/workspace';
import type {
  Capability,
  CreateWorkspace,
  Role,
} from '@snapform/contracts/workspace';
import type { Database, Transaction } from './client.ts';
import { workspace, membership } from './workspace-schema.ts';

type Connection = Database | Transaction;
const projection = {
  id: workspace.id,
  name: workspace.name,
  segment: workspace.segment,
  role: membership.role,
};
// actor comes only from a verified server-side Better Auth session, never a DTO.
async function identify(tx: Transaction, actor: string) {
  await tx.execute(
    sql`select set_config('snapform.user_id', ${actor}, true), set_config('snapform.workspace_id', '', true), set_config('snapform.role', '', true)`,
  );
}
async function scope(tx: Transaction, id: string, role: Role) {
  await tx.execute(
    sql`select set_config('snapform.workspace_id', ${id}, true), set_config('snapform.role', ${role}, true)`,
  );
}
export async function listWorkspaces(db: Connection, actor: string) {
  return db.transaction(async (tx) => {
    await identify(tx, actor);
    return tx
      .select(projection)
      .from(workspace)
      .innerJoin(membership, eq(workspace.id, membership.workspaceId))
      .where(eq(membership.userId, actor))
      .orderBy(desc(workspace.createdAt), desc(workspace.id))
      .limit(100);
  });
}
export async function createWorkspace(
  db: Connection,
  actor: string,
  raw: CreateWorkspace,
) {
  const input = createWorkspaceSchema.parse(raw);
  return db.transaction(async (tx) => {
    await identify(tx, actor);
    await scope(tx, input.id, 'owner');
    const inserted = await tx
      .insert(workspace)
      .values({ ...input, createdBy: actor })
      .onConflictDoNothing();
    if (inserted.rowCount === 0) {
      const [existing] = await tx
        .select(projection)
        .from(workspace)
        .innerJoin(membership, eq(workspace.id, membership.workspaceId))
        .where(and(eq(workspace.id, input.id), eq(membership.userId, actor)));
      if (
        !existing ||
        existing.role !== 'owner' ||
        existing.name !== input.name ||
        existing.segment !== input.segment
      )
        throw new Error('WORKSPACE_CONFLICT');
      return existing;
    }
    await tx
      .insert(membership)
      .values({ workspaceId: input.id, userId: actor, role: 'owner' });
    return { ...input, role: 'owner' as const };
  });
}
export async function inWorkspace<T>(
  db: Connection,
  actor: string,
  id: string,
  action: Capability,
  run: (tx: Transaction, role: Role) => Promise<T>,
): Promise<T> {
  const normalizedId = createWorkspaceSchema.shape.id.parse(id);
  return db.transaction(async (tx) => {
    await identify(tx, actor);
    const [member] = await tx
      .select({ role: membership.role })
      .from(membership)
      .where(
        and(
          eq(membership.workspaceId, normalizedId),
          eq(membership.userId, actor),
        ),
      );
    if (!member) throw new Error('WORKSPACE_NOT_FOUND');
    if (!can(member.role, action)) throw new Error('FORBIDDEN');
    await scope(tx, normalizedId, member.role);
    return run(tx, member.role);
  });
}
