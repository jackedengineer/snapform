import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  foreignKey,
  check,
  index,
  pgPolicy,
  pgRole,
} from 'drizzle-orm/pg-core';
import { responseSession } from './intake-schema.ts';
import { tenantAccess } from './tenant-policy.ts';
const runtime = pgRole('snapform_runtime').existing();
// Metadata for a respondent's private R2 object. Respondents write only through
// the 0046 SECURITY DEFINER functions; members read rows of submitted responses.
// The key is workspace/form/session/random, so purge can delete by prefix.
export const responseFile = pgTable(
  'response_file',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    formId: uuid('form_id').notNull(),
    versionId: uuid('version_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    questionId: uuid('question_id').notNull(),
    objectKey: text('object_key').notNull().unique(),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'response_file_session_fk',
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
    index('response_file_question_idx').on(table.sessionId, table.questionId),
    check(
      'response_file_key',
      sql`${table.objectKey} = ${table.workspaceId}::text||'/'||${table.formId}::text||'/'||${table.sessionId}::text||'/'||right(${table.objectKey},43) and right(${table.objectKey},43) ~ '^[A-Za-z0-9_-]{43}$'`,
    ),
    check(
      'response_file_name',
      sql`char_length(${table.name}) between 1 and 200 and ${table.name} !~ '[[:cntrl:]/\\\\]'`,
    ),
    check(
      'response_file_type',
      sql`${table.contentType} in ('application/pdf','image/png','image/jpeg','image/webp','image/gif','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv')`,
    ),
    check('response_file_size', sql`${table.size} between 1 and 26214400`),
    check('response_file_hash', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    pgPolicy('response_file_creator_read', {
      for: 'select',
      to: runtime,
      using: sql`(${tenantAccess(table.workspaceId, 'read')}) and exists (select 1 from public.response_session s where s.id = ${table.sessionId} and s.status = 'submitted')`,
    }),
  ],
).enableRLS();
