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
  check,
  index,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { MAX_WEBHOOK_BYTES } from '@snapform/contracts/webhook-protocol';
import { webhookConfiguration, formWebhookSettings } from './webhook-schema.ts';
import { formVersion, formPublication } from './publication-schema.ts';
import { responseOutbox } from './outbox-schema.ts';
import { user } from './schema.ts';
import { tenantAccess } from './tenant-policy.ts';
const runtime = pgRole('snapform_runtime').existing();
export const webhookDelivery = pgTable(
  'webhook_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    configurationId: uuid('configuration_id').notNull(),
    versionId: uuid('version_id').notNull(),
    eventId: uuid('event_id'),
    sessionId: uuid('session_id'),
    kind: text('kind', { enum: ['test', 'response.submitted'] }).notNull(),
    payload: text('payload'),
    status: text('status', {
      enum: [
        'preview',
        'pending',
        'sending',
        'acknowledged',
        'unknown',
        'needs_action',
        'cancelled',
      ],
    })
      .notNull()
      .default('preview'),
    reason: text('reason'),
    attempts: integer('attempts').notNull().default(0),
    firstAttemptAt: timestamp('first_attempt_at', { withTimezone: true }),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    httpStatus: integer('http_status'),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => user.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('webhook_delivery_event').on(table.eventId),
    foreignKey({
      name: 'webhook_delivery_configuration_tenant_fk',
      columns: [table.workspaceId, table.formId, table.configurationId],
      foreignColumns: [
        webhookConfiguration.workspaceId,
        webhookConfiguration.formId,
        webhookConfiguration.id,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'webhook_delivery_version_tenant_fk',
      columns: [table.workspaceId, table.formId, table.versionId],
      foreignColumns: [
        formVersion.workspaceId,
        formVersion.formId,
        formVersion.id,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'webhook_delivery_event_tenant_fk',
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
    check(
      'webhook_delivery_kind',
      sql`(${table.kind}='test' and ${table.eventId} is null and ${table.sessionId} is null and ${table.createdBy} is not null and ${table.payload} is not null) or (${table.kind}='response.submitted' and ${table.eventId} is not null and ${table.sessionId} is not null and ${table.createdBy} is null)`,
    ),
    check(
      'webhook_delivery_attempts',
      sql`${table.attempts} between 0 and 8 and ((${table.attempts}=0 and ${table.firstAttemptAt} is null) or (${table.attempts}>0 and ${table.firstAttemptAt} is not null))`,
    ),
    check(
      'webhook_delivery_payload',
      sql`${table.payload} is null or octet_length(${table.payload}) between 2 and ${sql.raw(String(MAX_WEBHOOK_BYTES))}`,
    ),
    check(
      'webhook_delivery_http',
      sql`${table.httpStatus} is null or ${table.httpStatus} between 100 and 599`,
    ),
    check(
      'webhook_delivery_ack',
      sql`((${table.status}='acknowledged')=(${table.acknowledgedAt} is not null)) and (${table.status}<>'acknowledged' or (${table.payload} is not null and ${table.attempts}>0))`,
    ),
    check(
      'webhook_delivery_lease',
      sql`(${table.status}='sending' and ${table.attempts}>0 and ${table.leaseToken} is not null and ${table.leaseUntil} is not null) or (${table.status}<>'sending' and ${table.leaseToken} is null and ${table.leaseUntil} is null)`,
    ),
    check(
      'webhook_delivery_state',
      sql`(${table.status} in ('preview','sending','acknowledged') and ${table.reason} is null and (${table.status}<>'preview' or ${table.kind}='test')) or (${table.status}='pending' and (${table.reason} is null or ${table.reason} in ('rate-limited','receiver-unavailable'))) or (${table.status}='unknown' and ${table.reason} is not distinct from 'receiver-unconfirmed') or (${table.status}='cancelled' and coalesce(${table.reason},'') in ('disabled','configuration-changed')) or (${table.status}='needs_action' and coalesce(${table.reason},'') in ('configuration','redirect-blocked','authorization','receiver-rejected','retry-later','attempts-exhausted','payload-invalid'))`,
    ),
    index('webhook_delivery_due_idx')
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.status}='pending'`),
    index('webhook_delivery_lease_idx')
      .on(table.leaseUntil)
      .where(sql`${table.status}='sending'`),
    pgPolicy('webhook_delivery_read', {
      for: 'select',
      to: runtime,
      using: tenantAccess(table.workspaceId, 'write'),
    }),
    pgPolicy('webhook_delivery_preview', {
      for: 'insert',
      to: runtime,
      withCheck: sql`${tenantAccess(table.workspaceId, 'write')} and ${table.kind}='test' and ${table.status}='preview' and ${table.attempts}=0 and ${table.createdBy}=current_setting('snapform.user_id',true) and exists(select 1 from ${formWebhookSettings} s where s.workspace_id=${table.workspaceId} and s.form_id=${table.formId} and s.configuration_id=${table.configurationId}) and exists(select 1 from ${formPublication} p where p.workspace_id=${table.workspaceId} and p.form_id=${table.formId} and p.version_id=${table.versionId} and p.active)`,
    }),
  ],
).enableRLS();
