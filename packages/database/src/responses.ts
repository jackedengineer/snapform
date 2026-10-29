import { and, desc, eq, sql } from 'drizzle-orm';
import { formCursorSchema } from '@snapform/contracts/draft';
import type { FormCursor } from '@snapform/contracts/draft';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { responseSession } from './intake-schema.ts';
import { formVersion } from './publication-schema.ts';
import { form } from './form-schema.ts';
const identity = formCursorSchema.shape.id;
const projection = {
  id: responseSession.id,
  versionId: responseSession.versionId,
  version: formVersion.number,
  submittedAt: sql<string>`to_char(${responseSession.submittedAt} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};
const key = (workspaceId: string, formId: string) =>
  and(
    eq(responseSession.workspaceId, workspaceId),
    eq(responseSession.formId, formId),
    eq(responseSession.status, 'submitted'),
  );
const versionKey = and(
  eq(formVersion.workspaceId, responseSession.workspaceId),
  eq(formVersion.formId, responseSession.formId),
  eq(formVersion.id, responseSession.versionId),
);
export async function listResponses(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  rawCursor?: FormCursor,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  const cursor =
    rawCursor === undefined ? undefined : formCursorSchema.parse(rawCursor);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'responses.read',
    async (tx, role) => {
      const [exists] = await tx
        .select({ id: form.id })
        .from(form)
        .where(and(eq(form.workspaceId, workspaceId), eq(form.id, formId)));
      if (!exists) throw Error('FORM_NOT_FOUND');
      const rows = await tx
        .select(projection)
        .from(responseSession)
        .innerJoin(formVersion, versionKey)
        .where(
          and(
            key(workspaceId, formId),
            cursor
              ? sql`(${responseSession.submittedAt},${responseSession.id}) < (${cursor.createdAt}::timestamptz,${cursor.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(responseSession.submittedAt), desc(responseSession.id))
        .limit(21);
      const responses = rows.slice(0, 20),
        last = responses.at(-1);
      return {
        responses,
        role,
        nextCursor:
          rows.length > 20 && last
            ? { createdAt: last.submittedAt, id: last.id }
            : null,
      };
    },
  );
}
export async function getResponse(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  id: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  id = identity.parse(id);
  return inWorkspace(db, actor, workspaceId, 'responses.read', async (tx) => {
    const [record] = await tx
      .select({
        ...projection,
        definition: formVersion.definition,
        answers: responseSession.answers,
      })
      .from(responseSession)
      .innerJoin(formVersion, versionKey)
      .where(and(key(workspaceId, formId), eq(responseSession.id, id)));
    if (!record) throw Error('RESPONSE_NOT_FOUND');
    return record;
  });
}
