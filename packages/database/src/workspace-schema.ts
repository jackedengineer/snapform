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
