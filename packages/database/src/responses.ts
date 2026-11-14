import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { formCursorSchema } from '@snapform/contracts/draft';
import {
  MAX_LISTED_VERSIONS,
  summarizeResponse,
} from '@snapform/contracts/responses';
import type { FormCursor } from '@snapform/contracts/draft';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { readResponseFiles } from './uploads.ts';
import { hasFileQuestion } from '@snapform/contracts/uploads';
import { responseSession } from './intake-schema.ts';
import { formVersion } from './publication-schema.ts';
import { form, formDraft } from './form-schema.ts';
const identity = formCursorSchema.shape.id;
type AnsweredText = Record<string, string>;
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
      const published = await tx
        .select({
          title: sql<string>`${formDraft.definition}->>'title'`,
          id: formVersion.id,
          number: formVersion.number,
        })
        .from(form)
        .innerJoin(
          formDraft,
          and(
            eq(formDraft.workspaceId, form.workspaceId),
            eq(formDraft.formId, form.id),
          ),
        )
        .leftJoin(
          formVersion,
          and(
            eq(formVersion.workspaceId, form.workspaceId),
            eq(formVersion.formId, form.id),
          ),
        )
        .where(and(eq(form.workspaceId, workspaceId), eq(form.id, formId)))
        .orderBy(desc(formVersion.number))
        .limit(MAX_LISTED_VERSIONS);
      if (!published.length) throw Error('FORM_NOT_FOUND');
      const rows = await tx
        .select({
          ...projection,
          // Migration 0045. Owners still list these so they can cancel.
          deletionPending: sql<boolean>`public.response_deletion_pending(${responseSession.workspaceId},${responseSession.id})`,
          // Only string answers, cut in SQL so large answers stay in the database.
          texts: sql<AnsweredText | null>`(select jsonb_object_agg(e.key,left(e.value->>'value',240)) from jsonb_each(${responseSession.answers}) e where e.value->>'state'='value' and jsonb_typeof(e.value->'value')='string')`,
        })
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
      const page = rows.slice(0, 20),
        last = page.at(-1);
      const versionIds = [...new Set(page.map((row) => row.versionId))];
      const definitions = new Map(
        versionIds.length
          ? (
              await tx
                .select({ id: formVersion.id, value: formVersion.definition })
                .from(formVersion)
                .where(
                  and(
                    eq(formVersion.workspaceId, workspaceId),
                    eq(formVersion.formId, formId),
                    inArray(formVersion.id, versionIds),
                  ),
                )
            ).map((version) => [version.id, version.value])
          : [],
      );
      const responses = page.map(({ texts, ...row }) => {
        const definition = definitions.get(row.versionId);
        if (!definition) throw Error('VERSION_NOT_FOUND');
        return { ...row, ...summarizeResponse(definition, texts ?? {}) };
      });
      return {
        title: published[0].title,
        responses,
        versions: published.flatMap((version) =>
          version.id && version.number
            ? [{ id: version.id, number: version.number }]
            : [],
        ),
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
    // Forms without file questions never read the 0046 table.
    const files = hasFileQuestion(record.definition)
      ? ((await readResponseFiles(tx, workspaceId, formId, [id])).get(id) ?? [])
      : undefined;
    return { ...record, files };
  });
}
