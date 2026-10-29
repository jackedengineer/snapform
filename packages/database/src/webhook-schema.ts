import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgRole,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  unique,
  foreignKey,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { form } from './form-schema.ts';
import { user } from './schema.ts';
import { tenantAccess } from './tenant-policy.ts';
const runtime = pgRole('snapform_runtime').existing();
export const webhookConfiguration = pgTable(
  'webhook_configuration',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    sealedDestination: text('sealed_destination').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('webhook_configuration_tenant').on(
      table.workspaceId,
      table.formId,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.formId],
      foreignColumns: [form.workspaceId, form.id],
    }).onDelete('cascade'),
    check(
      'webhook_configuration_envelope',
      sql`length(${table.sealedDestination}) between 80 and 8192 and ${table.sealedDestination} like 'v1.%'`,
    ),
    pgPolicy('webhook_configuration_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'write'),
    }),
    pgPolicy('webhook_configuration_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.createdBy}=current_setting('snapform.user_id',true) and ${table.verifiedAt} is null`,
    }),
  ],
).enableRLS();
export const formWebhookSettings = pgTable(
  'form_webhook_settings',
  {
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    configurationId: uuid('configuration_id').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    revision: integer('revision').notNull().default(1),
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
      name: 'form_webhook_configuration_tenant_fk',
      columns: [table.workspaceId, table.formId, table.configurationId],
      foreignColumns: [
        webhookConfiguration.workspaceId,
        webhookConfiguration.formId,
        webhookConfiguration.id,
      ],
    }).onDelete('cascade'),
    check('form_webhook_settings_revision', sql`${table.revision}>0`),
    pgPolicy('form_webhook_settings_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'read'),
    }),
    pgPolicy('form_webhook_settings_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.updatedBy}=current_setting('snapform.user_id',true)`,
    }),
    pgPolicy('form_webhook_settings_update', {
      for: 'update',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'write'),
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.updatedBy}=current_setting('snapform.user_id',true)`,
    }),
  ],
).enableRLS();
