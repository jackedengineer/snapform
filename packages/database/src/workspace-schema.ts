import { sql } from 'drizzle-orm';
import {
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  uuid,
  text,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { user } from './schema.ts';

const runtime = pgRole('snapform_runtime').existing();
export const workspaceRole = pgEnum('workspace_role', [
  'owner',
  'editor',
  'viewer',
]);
const identity = sql`current_setting('snapform.user_id', true)`;
const tenant = sql`current_setting('snapform.workspace_id', true)`;
const owner = sql`current_setting('snapform.role', true) = 'owner'`;
export const workspace = pgTable(
  'workspace',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    segment: text('segment').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'workspace_name_length',
      sql`length(trim(${table.name})) between 2 and 80`,
    ),
    check(
      'workspace_segment',
      sql`${table.segment} in ('agency', 'coach', 'consultant', 'startup')`,
    ),
    pgPolicy('workspace_read', {
      for: 'select',
      to: runtime,
      using: sql`exists (select 1 from public.membership m where m.workspace_id = ${table.id} and m.user_id = ${identity})`,
    }),
    pgPolicy('workspace_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${table.id}::text = ${tenant} and ${table.createdBy} = ${identity}`,
    }),
    pgPolicy('workspace_update', {
      for: 'update',
      to: runtime,
      using: sql`${table.id}::text = ${tenant} and ${owner}`,
      withCheck: sql`${table.id}::text = ${tenant} and ${owner}`,
    }),
  ],
).enableRLS();
export const membership = pgTable(
  'membership',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('membership_user_workspace_idx').on(table.userId, table.workspaceId),
    pgPolicy('membership_read', {
      for: 'select',
      to: runtime,
      using: sql`case when nullif(${tenant}, '') is null then ${table.userId} = ${identity} else ${table.workspaceId}::text = ${tenant} end`,
    }),
    pgPolicy('membership_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${table.workspaceId}::text = ${tenant} and ${owner}`,
    }),
    pgPolicy('membership_update', {
      for: 'update',
      to: runtime,
      using: sql`${table.workspaceId}::text = ${tenant} and ${owner}`,
      withCheck: sql`${table.workspaceId}::text = ${tenant} and ${owner}`,
    }),
    pgPolicy('membership_delete', {
      for: 'delete',
      to: runtime,
      using: sql`${table.workspaceId}::text = ${tenant} and ${owner}`,
    }),
  ],
).enableRLS();
// Reached only through the team functions in migration 0042: no table grants.
export const workspaceInvitation = pgTable(
  'workspace_invitation',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: workspaceRole('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`statement_timestamp()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'workspace_invitation_email',
      sql`${table.email}=lower(${table.email}) and length(${table.email}) between 3 and 254 and ${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+$'`,
    ),
    check(
      'workspace_invitation_role',
      sql`${table.role} in ('editor','viewer')`,
    ),
    check(
      'workspace_invitation_hash',
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'workspace_invitation_expiry',
      sql`${table.expiresAt}=${table.createdAt}+interval '7 days'`,
    ),
    check(
      'workspace_invitation_outcome',
      sql`${table.acceptedAt} is null or ${table.revokedAt} is null`,
    ),
    uniqueIndex('workspace_invitation_pending')
      .on(table.workspaceId, table.email)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    index('workspace_invitation_recent').on(table.workspaceId, table.createdAt),
  ],
).enableRLS();
