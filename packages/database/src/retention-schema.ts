import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgRole,
  pgPolicy,
  uuid,
  integer,
  text,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { workspace } from './workspace-schema.ts';
import { user } from './schema.ts';
import { tenantAccess } from './tenant-policy.ts';
const runtime = pgRole('snapform_runtime').existing();
export const workspaceRetention = pgTable(
  'workspace_retention',
  {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    days: integer('days').notNull().default(90),
    revision: integer('revision').notNull().default(1),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    const owner = sql`${table.workspaceId}::text=current_setting('snapform.workspace_id',true) and exists(select 1 from public.membership m where m.workspace_id=${table.workspaceId} and m.user_id=current_setting('snapform.user_id',true) and m.role='owner')`;
    const actor = sql`${table.updatedBy}=current_setting('snapform.user_id',true)`;
    return [
      check('workspace_retention_days', sql`${table.days} in (30,90,365)`),
      check('workspace_retention_revision', sql`${table.revision}>0`),
      pgPolicy('workspace_retention_read', {
        for: 'select',
        to: runtime,
        using: tenantAccess(table.workspaceId, 'read'),
      }),
      pgPolicy('workspace_retention_create', {
        for: 'insert',
        to: runtime,
        withCheck: sql`${owner} and ${actor}`,
      }),
      pgPolicy('workspace_retention_update', {
        for: 'update',
        to: runtime,
        using: owner,
        withCheck: sql`${owner} and ${actor}`,
      }),
    ];
  },
).enableRLS();
