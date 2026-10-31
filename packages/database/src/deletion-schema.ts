import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  check,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
// Metadata has no target/user FK: it survives deletion for the recovery window.
export const deletionRequest = pgTable(
  'deletion_request',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    kind: text('kind', { enum: ['response', 'workspace'] }).notNull(),
    targetId: uuid('target_id').notNull(),
    requestedBy: text('requested_by').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .default(sql`statement_timestamp()`),
    notBefore: timestamp('not_before', { withTimezone: true }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    purgeId: uuid('purge_id'),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check(
      'deletion_request_kind',
      sql`${table.kind} in ('response','workspace')`,
    ),
    check(
      'deletion_request_workspace_target',
      sql`${table.kind}='response' or ${table.targetId}=${table.workspaceId}`,
    ),
    check(
      'deletion_request_deadline',
      sql`${table.notBefore}=${table.requestedAt}+interval '24 hours'`,
    ),
    check(
      'deletion_request_cancellation',
      sql`(${table.cancelledAt} is null and ${table.cancelledBy} is null) or (${table.cancelledAt} is not null and ${table.cancelledBy} is not null and ${table.cancelledAt}>=${table.requestedAt} and ${table.cancelledAt}<${table.notBefore} and ${table.purgeId} is null)`,
    ),
    check('deletion_request_revision', sql`${table.revision}>0`),
    uniqueIndex('deletion_request_active_target')
      .on(table.kind, table.targetId)
      .where(sql`${table.cancelledAt} is null`),
    index('deletion_request_due')
      .on(table.notBefore, table.id)
      .where(sql`${table.cancelledAt} is null and ${table.purgeId} is null`),
    index('deletion_request_workspace_target').on(
      table.workspaceId,
      table.kind,
      table.targetId,
      table.requestedAt,
    ),
  ],
).enableRLS();
