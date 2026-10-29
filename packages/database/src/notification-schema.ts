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
  index,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { emailDeliveryStates } from '@snapform/contracts/notifications';
import { form } from './form-schema.ts';
import { user } from './schema.ts';
import { responseOutbox } from './outbox-schema.ts';
import { tenantAccess } from './tenant-policy.ts';
const runtime = pgRole('snapform_runtime').existing();
export const formEmailSettings = pgTable(
  'form_email_settings',
  {
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
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
      columns: [table.workspaceId, table.formId],
      foreignColumns: [form.workspaceId, form.id],
    }).onDelete('cascade'),
    check('form_email_settings_revision', sql`${table.revision}>0`),
    pgPolicy('form_email_settings_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'read'),
    }),
    pgPolicy('form_email_settings_create', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.updatedBy}=current_setting('snapform.user_id',true)`,
    }),
    pgPolicy('form_email_settings_update', {
      for: 'update',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'write'),
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.updatedBy}=current_setting('snapform.user_id',true)`,
    }),
  ],
).enableRLS();
export const responseEmailDelivery = pgTable(
  'response_email_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    recipientUserId: text('recipient_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    recipientEmail: text('recipient_email').notNull(),
    settingsRevision: integer('settings_revision').notNull(),
    status: text('status', { enum: emailDeliveryStates })
      .notNull()
      .default('pending'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('response_email_event').on(table.eventId),
    foreignKey({
      name: 'response_email_event_tenant_fk',
      columns: [
        table.eventId,
        table.workspaceId,
        table.formId,
        table.sessionId,
      ],
      foreignColumns: [
        responseOutbox.id,
        responseOutbox.workspaceId,
        responseOutbox.formId,
        responseOutbox.sessionId,
      ],
    }).onDelete('cascade'),
    index('response_email_pending_idx')
      .on(table.createdAt)
      .where(sql`${table.status}='pending'`),
    check('response_email_settings_revision', sql`${table.settingsRevision}>0`),
    check(
      'response_email_state',
      sql`(${table.status}='pending' and ${table.reason} is null) or (${table.status}='cancelled' and ${table.reason} is not distinct from 'disabled') or (${table.status}='needs_action' and ${table.reason} is not distinct from 'recipient-unavailable')`,
    ),
    pgPolicy('response_email_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'read'),
    }),
  ],
).enableRLS();
