import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
  unique,
  index,
  foreignKey,
  check,
  pgRole,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import type { FormDefinition } from '@snapform/contracts/form';
import { user } from './schema.ts';
import { workspace } from './workspace-schema.ts';
import { tenantAccess } from './tenant-policy.ts';
const runtime = pgRole('snapform_runtime').existing();
const identity = sql`current_setting('snapform.user_id', true)`;
export const form = pgTable(
  'form',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('form_workspace_id_unique').on(table.workspaceId, table.id),
    index('form_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    pgPolicy('form_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'read'),
    }),
    pgPolicy('form_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.createdBy} = ${identity}`,
    }),
  ],
).enableRLS();
export const formDraft = pgTable(
  'form_draft',
  {
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    revision: integer('revision').notNull(),
    definition: jsonb('definition').$type<FormDefinition>().notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.formId] }),
    foreignKey({
      columns: [table.workspaceId, table.formId],
      foreignColumns: [form.workspaceId, form.id],
    }).onDelete('cascade'),
    check('form_draft_revision_positive', sql`${table.revision} > 0`),
    check(
      'form_draft_definition_object',
      sql`jsonb_typeof(${table.definition}) = 'object' and coalesce(${table.definition}->>'contractVersion', '') = '1'`,
    ),
    pgPolicy('form_draft_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'read'),
    }),
    pgPolicy('form_draft_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.updatedBy} = ${identity}`,
    }),
    pgPolicy('form_draft_update', {
      for: 'update',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'write'),
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.updatedBy} = ${identity}`,
    }),
  ],
).enableRLS();
export const draftOperation = pgTable(
  'draft_operation',
  {
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    id: uuid('id').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    baseRevision: integer('base_revision').notNull(),
    resultRevision: integer('result_revision').notNull(),
    payloadHash: text('payload_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.formId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.formId],
      foreignColumns: [form.workspaceId, form.id],
    }).onDelete('cascade'),
    check(
      'draft_operation_revision_step',
      sql`${table.baseRevision} >= 0 and ${table.resultRevision} = ${table.baseRevision} + 1`,
    ),
    check('draft_operation_hash', sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`),
    pgPolicy('draft_operation_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'write'),
    }),
    pgPolicy('draft_operation_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.actorId} = ${identity}`,
    }),
  ],
).enableRLS();
