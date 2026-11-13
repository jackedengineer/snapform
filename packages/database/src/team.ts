import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { can, createWorkspaceSchema } from '@snapform/contracts/workspace';
import {
  createInvitationSchema,
  invitationHashSchema,
  invitationListSchema,
  invitationAcceptedSchema,
  memberChangedSchema,
  memberIdSchema,
  roleChangeSchema,
  teamSchema,
  invitationIdSchema,
  invitationSchema,
} from '@snapform/contracts/team';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';

type Connection = Database | Transaction;
// Codes raised by the migration 0042 functions; anything else stays a 500.
const codes = new Set([
  'WORKSPACE_NOT_FOUND',
  'FORBIDDEN',
  'WORKSPACE_DELETION_PENDING',
  'INVALID_INVITATION',
  'ALREADY_MEMBER',
  'INVITATION_RATE_LIMITED',
  'SEAT_LIMIT_REACHED',
  'INVITATION_CONFLICT',
  'INVITATION_NOT_FOUND',
  'INVITATION_USED',
  'INVITATION_REVOKED',
  'INVITATION_EXPIRED',
  'INVITATION_EMAIL_MISMATCH',
  'EMAIL_NOT_VERIFIED',
  'INVALID_ROLE',
  'MEMBER_NOT_FOUND',
  'LAST_OWNER',
]);
async function call<T extends Record<string, unknown>>(
  tx: Transaction,
  query: SQL,
) {
  try {
    return (await tx.execute<T>(query)).rows;
  } catch (error) {
    const code =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : '';
    if (codes.has(code)) throw Error(code, { cause: error });
    throw error;
  }
}
function iso(value: unknown) {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : value;
}
const workspaceId = createWorkspaceSchema.shape.id;

export async function listTeam(db: Connection, actor: string, id: string) {
  const workspace = workspaceId.parse(id);
  return inWorkspace(db, actor, workspace, 'members.read', async (tx, role) => {
    const rows = await call(
      tx,
      sql`select m.user_id,u.name,u.email,m.role,m.created_at from public.membership m join public."user" u on u.id=m.user_id where m.workspace_id=${workspace}::uuid order by m.created_at,m.user_id limit 200`,
    );
    return teamSchema.parse({
      role,
      members: rows.map((row) => ({
        userId: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
        joinedAt: iso(row.created_at),
      })),
    });
  });
}
// The billing hook. It runs inside the invitation transaction, after the
// owner check and workspace lock, so a plan lookup cannot race the insert.
// null means no seat limit; members plus live invitations use seats.
export type SeatLimit = (
  tx: Transaction,
  workspaceId: string,
) => Promise<number | null>;
export const noSeatLimit: SeatLimit = async () => null;
export async function createInvitation(
  db: Connection,
  actor: string,
  id: string,
  raw: unknown,
  tokenHash: string,
  seatLimit: SeatLimit,
) {
  const workspace = workspaceId.parse(id),
    input = createInvitationSchema.parse(raw),
    hash = invitationHashSchema.parse(tokenHash);
  return inWorkspace(db, actor, workspace, 'members.manage', async (tx) => {
    const limit = await seatLimit(tx, workspace);
    if (limit !== null && !(Number.isSafeInteger(limit) && limit > 0))
      throw Error('INVALID_SEAT_LIMIT');
    const [row] = await call<{ invitation: unknown }>(
      tx,
      sql`select public.create_workspace_invitation(${workspace}::uuid,${input.email},${input.role},${hash},${limit}::integer) as invitation`,
    );
    const created = row?.invitation;
    if (
      !created ||
      typeof created !== 'object' ||
      !('workspaceName' in created) ||
      typeof created.workspaceName !== 'string'
    )
      throw Error('INVALID_INVITATION_RECEIPT');
    const { workspaceName, ...rest } = created;
    const invitation = invitationSchema.parse({
      ...rest,
      createdAt: iso('createdAt' in rest ? rest.createdAt : null),
      expiresAt: iso('expiresAt' in rest ? rest.expiresAt : null),
    });
    return { invitation, workspaceName };
  });
}
export async function listInvitations(
  db: Connection,
  actor: string,
  id: string,
) {
  const workspace = workspaceId.parse(id);
  return inWorkspace(db, actor, workspace, 'members.read', async (tx, role) => {
    if (!can(role, 'members.manage')) throw Error('FORBIDDEN');
    const rows = await call(
      tx,
      sql`select * from public.list_workspace_invitations(${workspace}::uuid)`,
    );
    return invitationListSchema.parse({
      invitations: rows.map((row) => ({
        id: row.invitation_id,
        email: row.invited_email,
        role: row.invited_role,
        createdAt: iso(row.invited_at),
        expiresAt: iso(row.expires),
      })),
    });
  });
}
export async function revokeInvitation(
  db: Connection,
  actor: string,
  id: string,
  invitationId: string,
) {
  const workspace = workspaceId.parse(id),
    invitation = invitationIdSchema.parse(invitationId);
  await inWorkspace(db, actor, workspace, 'members.manage', async (tx) => {
    await call(
      tx,
      sql`select public.revoke_workspace_invitation(${workspace}::uuid,${invitation}::uuid)`,
    );
  });
}
// Acceptance has no workspace context yet: the function finds it by token hash
// and checks the verified account email itself.
export async function acceptInvitation(
  db: Connection,
  actor: string,
  tokenHash: string,
) {
  const hash = invitationHashSchema.parse(tokenHash);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('snapform.user_id',${actor},true),set_config('snapform.workspace_id','',true),set_config('snapform.role','',true)`,
    );
    const [row] = await call<{ workspace: unknown }>(
      tx,
      sql`select public.accept_workspace_invitation(${hash}) as workspace`,
    );
    return invitationAcceptedSchema.parse({ workspace: row?.workspace })
      .workspace;
  });
}
export async function changeMemberRole(
  db: Connection,
  actor: string,
  id: string,
  userId: string,
  raw: unknown,
) {
  const workspace = workspaceId.parse(id),
    member = memberIdSchema.parse(userId),
    { role } = roleChangeSchema.parse(raw);
  return inWorkspace(db, actor, workspace, 'members.manage', async (tx) => {
    const [row] = await call<{ member: unknown }>(
      tx,
      sql`select public.change_workspace_member_role(${workspace}::uuid,${member},${role}) as member`,
    );
    return memberChangedSchema.parse({ member: row?.member }).member;
  });
}
export async function removeMember(
  db: Connection,
  actor: string,
  id: string,
  userId: string,
) {
  const workspace = workspaceId.parse(id),
    member = memberIdSchema.parse(userId);
  await inWorkspace(db, actor, workspace, 'members.manage', async (tx) => {
    await call(
      tx,
      sql`select public.remove_workspace_member(${workspace}::uuid,${member})`,
    );
  });
}
