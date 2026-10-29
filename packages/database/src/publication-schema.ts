import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  unique,
  primaryKey,
  foreignKey,
  check,
  pgPolicy,
  pgRole,
} from 'drizzle-orm/pg-core';
import type { FormDefinition } from '@snapform/contracts/form';
import { user } from './schema.ts';
import { form } from './form-schema.ts';
import { tenantAccess } from './tenant-policy.ts';
const runtime = pgRole('snapform_runtime').existing();
const identity = sql`current_setting('snapform.user_id', true)`;
export const formVersion = pgTable(
  'form_version',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    number: integer('number').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    definition: jsonb('definition').$type<FormDefinition>().notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('form_version_tenant_identity').on(
      table.workspaceId,
      table.formId,
      table.id,
    ),
    unique('form_version_number').on(
      table.workspaceId,
      table.formId,
      table.number,
    ),
    foreignKey({
      columns: [table.workspaceId, table.formId],
      foreignColumns: [form.workspaceId, form.id],
    }).onDelete('cascade'),
    check(
      'form_version_positive_revisions',
      sql`${table.number} > 0 and ${table.sourceRevision} > 0`,
    ),
    check(
      'form_version_definition_object',
      sql`jsonb_typeof(${table.definition}) = 'object' and coalesce(${table.definition}->>'contractVersion', '') = '1'`,
    ),
    pgPolicy('form_version_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'read'),
    }),
    pgPolicy('form_version_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.createdBy} = ${identity}`,
    }),
  ],
).enableRLS();
export const formPublication = pgTable(
  'form_publication',
  {
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    publicId: uuid('public_id').notNull(),
    versionId: uuid('version_id').notNull(),
    active: boolean('active').notNull().default(false),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.formId] }),
    unique('form_publication_public_identity').on(table.publicId),
    foreignKey({
      columns: [table.workspaceId, table.formId],
      foreignColumns: [form.workspaceId, form.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.formId, table.versionId],
      foreignColumns: [
        formVersion.workspaceId,
        formVersion.formId,
        formVersion.id,
      ],
    }).onDelete('restrict'),
    pgPolicy('form_publication_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'read'),
    }),
    pgPolicy('form_publication_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.updatedBy} = ${identity}`,
    }),
    pgPolicy('form_publication_update', {
      for: 'update',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'write'),
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.updatedBy} = ${identity}`,
    }),
  ],
).enableRLS();
