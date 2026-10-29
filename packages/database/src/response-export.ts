import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  MAX_EXPORT_ROWS,
  MAX_EXPORT_ANSWER_BYTES,
} from '@snapform/contracts/response-csv';
import { formCursorSchema } from '@snapform/contracts/draft';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { formVersion } from './publication-schema.ts';
import { responseSession } from './intake-schema.ts';
const identity = formCursorSchema.shape.id;
export async function getResponseExport(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  versionId: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  versionId = identity.parse(versionId);
  return inWorkspace(db, actor, workspaceId, 'responses.export', async (tx) => {
    const [version] = await tx
      .select({
        definition: formVersion.definition,
        version: formVersion.number,
      })
      .from(formVersion)
      .where(
        and(
          eq(formVersion.workspaceId, workspaceId),
          eq(formVersion.formId, formId),
          eq(formVersion.id, versionId),
        ),
      );
    if (!version) throw Error('VERSION_NOT_FOUND');
    const key = and(
      eq(responseSession.workspaceId, workspaceId),
      eq(responseSession.formId, formId),
      eq(responseSession.versionId, versionId),
      eq(responseSession.status, 'submitted'),
    );
    // Read bounded metadata first so large answer sets never enter Worker memory.
    const metadata = await tx
      .select({
        id: responseSession.id,
        bytes: sql<number>`octet_length(${responseSession.answers}::text)`,
      })
      .from(responseSession)
      .where(key)
      .orderBy(desc(responseSession.submittedAt), desc(responseSession.id))
      .limit(MAX_EXPORT_ROWS + 1);
    if (
      metadata.length > MAX_EXPORT_ROWS ||
      metadata.reduce((sum, row) => sum + row.bytes, 0) >
        MAX_EXPORT_ANSWER_BYTES
    )
      throw Error('EXPORT_TOO_LARGE');
    if (!metadata.length) return { ...version, rows: [] };
    const rows = await tx
      .select({
        id: responseSession.id,
        submittedAt: sql<string>`to_char(${responseSession.submittedAt} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        answers: responseSession.answers,
      })
      .from(responseSession)
      .where(
        and(
          key,
          inArray(
            responseSession.id,
            metadata.map((row) => row.id),
          ),
        ),
      )
      .orderBy(desc(responseSession.submittedAt), desc(responseSession.id));
    if (rows.length !== metadata.length) throw Error('EXPORT_CHANGED');
    return { ...version, rows };
  });
}
