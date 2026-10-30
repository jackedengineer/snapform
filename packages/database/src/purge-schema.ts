import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  check,
  index,
} from 'drizzle-orm/pg-core';
// No target FK: irreversible recovery metadata must survive content cascades.
export const purgeIntent = pgTable(
  'purge_intent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    kind: text('kind', { enum: ['response', 'workspace'] }).notNull(),
    targetId: uuid('target_id').notNull(),
    reason: text('reason', { enum: ['expired', 'owner'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    unique('purge_intent_target').on(table.kind, table.targetId),
    check('purge_intent_kind', sql`${table.kind} in ('response','workspace')`),
    check('purge_intent_reason', sql`${table.reason} in ('expired','owner')`),
    check(
      'purge_intent_workspace_target',
      sql`${table.kind}='response' or (${table.targetId}=${table.workspaceId} and ${table.reason}='owner')`,
    ),
    check(
      'purge_intent_completion',
      sql`${table.completedAt} is null or ${table.completedAt}>=${table.createdAt}`,
    ),
    index('purge_intent_pending_idx')
      .on(table.createdAt, table.id)
      .where(sql`${table.completedAt} is null`),
  ],
).enableRLS();
