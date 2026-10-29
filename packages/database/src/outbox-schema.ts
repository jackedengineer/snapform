import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgRole,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  foreignKey,
  index,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { responseSession } from './intake-schema.ts';
import { tenantAccess } from './tenant-policy.ts';

const runtime = pgRole('snapform_runtime').existing();
export const responseOutbox = pgTable(
  'response_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    versionId: uuid('version_id').notNull(),
    kind: text('kind').notNull().default('response.submitted'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    unique('response_outbox_session').on(table.sessionId),
    foreignKey({
      name: 'response_outbox_session_fk',
      columns: [
        table.workspaceId,
        table.formId,
        table.versionId,
        table.sessionId,
      ],
      foreignColumns: [
        responseSession.workspaceId,
        responseSession.formId,
        responseSession.versionId,
        responseSession.id,
      ],
    }).onDelete('cascade'),
    index('response_outbox_due_idx')
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.completedAt} is null`),
    check('response_outbox_kind', sql`${table.kind} = 'response.submitted'`),
    check('response_outbox_attempts', sql`${table.attempts} >= 0`),
    check(
      'response_outbox_lease',
      sql`(${table.leaseToken} is null) = (${table.leaseUntil} is null)`,
    ),
    pgPolicy('response_outbox_read', {
      for: 'select',
      to: runtime,
      using: sql`public.intake_session_access(${table.sessionId}) or (${tenantAccess(table.workspaceId, 'read')})`,
    }),
  ],
).enableRLS();
