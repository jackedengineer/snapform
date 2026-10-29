import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  unique,
  foreignKey,
  check,
  index,
  pgPolicy,
  pgRole,
  primaryKey,
} from 'drizzle-orm/pg-core';
import type { Answer } from '@snapform/contracts/answers';
import { formVersion } from './publication-schema.ts';
import { user } from './schema.ts';
import { tenantAccess } from './tenant-policy.ts';
const runtime = pgRole('snapform_runtime').existing();
export const responseSession = pgTable(
  'response_session',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    versionId: uuid('version_id').notNull(),
    capabilityHash: text('capability_hash').notNull().unique(),
    revision: integer('revision').notNull().default(1),
    answers: jsonb('answers')
      .$type<Record<string, Answer>>()
      .notNull()
      .default({}),
    status: text('status', { enum: ['collecting', 'submitted'] })
      .notNull()
      .default('collecting'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    reservationUntil: timestamp('reservation_until', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '15 minutes'`),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    endingId: uuid('ending_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    const scoped = sql`${table.id} = nullif(current_setting('snapform.intake_id',true),'')::uuid and public.intake_session_access(${table.id})`;
    return [
      unique('response_session_tenant_identity').on(
        table.workspaceId,
        table.formId,
        table.versionId,
        table.id,
      ),
      foreignKey({
        name: 'response_session_version_fk',
        columns: [table.workspaceId, table.formId, table.versionId],
        foreignColumns: [
          formVersion.workspaceId,
          formVersion.formId,
          formVersion.id,
        ],
      }).onDelete('restrict'),
      index('response_session_expiry_idx').on(table.expiresAt),
      index('response_session_reservation_idx').on(
        table.workspaceId,
        table.status,
        table.reservationUntil,
      ),
      check(
        'response_session_reservation_expiry',
        sql`${table.reservationUntil} <= ${table.expiresAt}`,
      ),
      check(
        'response_session_hash',
        sql`${table.capabilityHash} ~ '^[0-9a-f]{64}$'`,
      ),
      check('response_session_revision', sql`${table.revision} > 0`),
      check(
        'response_session_status',
        sql`${table.status} in ('collecting','submitted')`,
      ),
      check(
        'response_session_expiry',
        sql`${table.expiresAt} > ${table.createdAt}`,
      ),
      check(
        'response_session_answers',
        sql`jsonb_typeof(${table.answers}) = 'object' and octet_length(${table.answers}::text) <= 2097152`,
      ),
      check(
        'response_session_submission',
        sql`(${table.status} = 'collecting' and ${table.submittedAt} is null and ${table.endingId} is null) or (${table.status} = 'submitted' and ${table.submittedAt} is not null and ${table.endingId} is not null)`,
      ),
      index('response_session_inbox_idx')
        .on(
          table.workspaceId,
          table.formId,
          table.submittedAt.desc(),
          table.id.desc(),
        )
        .where(sql`${table.status} = 'submitted'`),
      pgPolicy('response_session_creator_read', {
        for: 'select',
        to: runtime,
        using: sql`${table.status} = 'submitted' and (${tenantAccess(table.workspaceId, 'read')})`,
      }),
      pgPolicy('response_session_read', {
        for: 'select',
        to: runtime,
        using: scoped,
      }),
      pgPolicy('response_session_update', {
        for: 'update',
        to: runtime,
        using: sql`${scoped} and ${table.status} = 'collecting'`,
        withCheck: sql`${scoped} and ${table.status} = 'collecting'`,
      }),
    ];
  },
).enableRLS();

export const trialResponseUsage = pgTable(
  'trial_response_usage',
  {
    ownerId: text('owner_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    responsesUsed: integer('responses_used').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'trial_response_usage_bounds',
      sql`${table.responsesUsed} >= 0 and ${table.responsesUsed} <= 50`,
    ),
    pgPolicy('trial_response_usage_read', {
      for: 'select',
      to: runtime,
      using: sql`${table.ownerId} = current_setting('snapform.user_id',true)`,
    }),
  ],
).enableRLS();

export const intakeOperation = pgTable(
  'intake_operation',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => responseSession.id, { onDelete: 'cascade' }),
    id: uuid('id').notNull(),
    kind: text('kind', { enum: ['save', 'submit'] }).notNull(),
    payloadHash: text('payload_hash').notNull(),
    baseRevision: integer('base_revision').notNull(),
    resultRevision: integer('result_revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.id] }),
    check('intake_operation_kind', sql`${table.kind} in ('save','submit')`),
    check(
      'intake_operation_hash',
      sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'intake_operation_revisions',
      sql`${table.baseRevision} > 0 and ${table.resultRevision} = ${table.baseRevision} + 1`,
    ),
    pgPolicy('intake_operation_read', {
      for: 'select',
      to: runtime,
      using: sql`public.intake_session_access(${table.sessionId})`,
    }),
  ],
).enableRLS();
