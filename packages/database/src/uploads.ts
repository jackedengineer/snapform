import { sql } from 'drizzle-orm';
import {
  capabilityHashSchema,
  intakeEnvelopeSchema,
} from '@snapform/contracts/intake';
import {
  uploadedFilesSchema,
  uploadTypeSchema,
  MAX_UPLOAD_BYTES,
} from '@snapform/contracts/uploads';
import type { UploadType } from '@snapform/contracts/uploads';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
type Connection = Database | Transaction;
const identity = intakeEnvelopeSchema.shape.session.shape.id;
const keyPattern =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{43}$/;
// Functions in migration 0046 raise typed messages; expose only those.
function typed(error: unknown, codes: string[]): unknown {
  const code =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : '';
  return codes.includes(code) ? Error(code, { cause: error }) : error;
}
const scope = (publicId: string, sessionId: string, hash: string) =>
  sql`${identity.parse(publicId)}::uuid,${identity.parse(sessionId)}::uuid,${capabilityHashSchema.parse(hash)}`;
const fileRows = (rows: Record<string, unknown>[]) =>
  uploadedFilesSchema.parse(
    rows.map((row) => ({
      id: row.id,
      questionId: row.question_id,
      name: row.name,
      size: row.size,
      type: row.content_type,
    })),
  );

export type UploadSlot =
  { outcome: 'ok'; workspaceId: string; formId: string } | { outcome: string };
/** Whether this capability may add a file to the question, before any bytes are stored. */
export async function authorizeUpload(
  db: Connection,
  publicId: string,
  sessionId: string,
  hash: string,
  questionId: string,
): Promise<UploadSlot> {
  const { rows } = await db.execute<{
    outcome: string;
    file_workspace: string | null;
    file_form: string | null;
  }>(
    sql`select * from public.authorize_intake_file(${scope(publicId, sessionId, hash)},${identity.parse(questionId)}::uuid)`,
  );
  const row = rows[0];
  if (!row) return { outcome: 'INTAKE_UNAVAILABLE' };
  if (row.outcome !== 'ok') return { outcome: row.outcome };
  return {
    outcome: 'ok',
    workspaceId: identity.parse(row.file_workspace),
    formId: identity.parse(row.file_form),
  };
}
export type StoredUpload = {
  id: string;
  questionId: string;
  key: string;
  name: string;
  type: UploadType;
  size: number;
  sha256: string;
};
/** Records a verified object; anything but 'ok' means the caller deletes it. */
export async function recordUpload(
  db: Connection,
  publicId: string,
  sessionId: string,
  hash: string,
  file: StoredUpload,
): Promise<string> {
  if (
    !keyPattern.test(file.key) ||
    !/^[0-9a-f]{64}$/.test(file.sha256) ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > MAX_UPLOAD_BYTES
  )
    return 'INVALID_FILE';
  const { rows } = await db.execute<{ outcome: string }>(
    sql`select public.record_intake_file(${scope(publicId, sessionId, hash)},${identity.parse(file.id)}::uuid,${identity.parse(file.questionId)}::uuid,${file.key},${file.name},${uploadTypeSchema.parse(file.type)},${file.size}::integer,${file.sha256}) as outcome`,
  );
  return rows[0]?.outcome ?? 'INTAKE_UNAVAILABLE';
}
export async function listUploads(
  db: Connection,
  publicId: string,
  sessionId: string,
  hash: string,
) {
  try {
    const { rows } = await db.execute<Record<string, unknown>>(
      sql`select * from public.list_intake_files(${scope(publicId, sessionId, hash)})`,
    );
    return fileRows(rows);
  } catch (error) {
    throw typed(error, ['INTAKE_UNAVAILABLE']);
  }
}
/** The removed object's key, or null when the file is not this session's. */
export async function removeUpload(
  db: Connection,
  publicId: string,
  sessionId: string,
  hash: string,
  fileId: string,
): Promise<string | null> {
  try {
    const { rows } = await db.execute<{ key: string | null }>(
      sql`select public.remove_intake_file(${scope(publicId, sessionId, hash)},${identity.parse(fileId)}::uuid) as key`,
    );
    const key = rows[0]?.key ?? null;
    if (key !== null && !keyPattern.test(key)) throw Error('INVALID_FILE_KEY');
    return key;
  } catch (error) {
    throw typed(error, ['INTAKE_UNAVAILABLE', 'INTAKE_ALREADY_SUBMITTED']);
  }
}
/** Keys of files the submitted answers do not reference; their rows are gone. */
export async function discardUnreferencedUploads(
  db: Connection,
  publicId: string,
  sessionId: string,
  hash: string,
): Promise<string[]> {
  const { rows } = await db.execute<{ key: string }>(
    sql`select key from public.discard_unreferenced_intake_files(${scope(publicId, sessionId, hash)}) key`,
  );
  return rows.map((row) => row.key).filter((key) => keyPattern.test(key));
}
/** Files of submitted responses; RLS limits rows to the caller's workspace. */
export async function readResponseFiles(
  tx: Transaction,
  workspaceId: string,
  formId: string,
  sessionIds: string[],
) {
  if (!sessionIds.length) return new Map<string, ReturnType<typeof fileRows>>();
  const { rows } = await tx.execute<Record<string, unknown>>(
    sql`select f.session_id,f.id,f.question_id,f.name,f.size,f.content_type
      from public.response_file f
      where f.workspace_id=${workspaceId}::uuid and f.form_id=${formId}::uuid
        and f.session_id in ${sessionIds.map((id) => identity.parse(id))}
        and not public.response_deletion_pending(f.workspace_id,f.session_id)
      order by f.created_at,f.id`,
  );
  const grouped = new Map<string, Record<string, unknown>[]>(
    sessionIds.map((id) => [id, []]),
  );
  for (const row of rows) grouped.get(String(row.session_id))?.push(row);
  return new Map(
    [...grouped].map(([id, files]) => [id, fileRows(files)] as const),
  );
}
/** A submitted response's files for a member; empty when there are none. */
export async function listResponseFiles(
  db: Connection,
  actor: string,
  workspaceId: string,
  formId: string,
  responseId: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  responseId = identity.parse(responseId);
  return inWorkspace(db, actor, workspaceId, 'responses.read', async (tx) => {
    const files = await readResponseFiles(tx, workspaceId, formId, [
      responseId,
    ]);
    return files.get(responseId) ?? [];
  });
}
/** One stored file for a member who may read responses. */
export async function getResponseFile(
  db: Connection,
  actor: string,
  workspaceId: string,
  formId: string,
  responseId: string,
  fileId: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  responseId = identity.parse(responseId);
  fileId = identity.parse(fileId);
  return inWorkspace(db, actor, workspaceId, 'responses.read', async (tx) => {
    // RLS adds membership and the submitted state of the response.
    const {
      rows: [row],
    } = await tx.execute<Record<string, unknown>>(
      sql`select f.object_key,f.name,f.content_type,f.size from public.response_file f
        where f.workspace_id=${workspaceId}::uuid and f.form_id=${formId}::uuid
          and f.session_id=${responseId}::uuid and f.id=${fileId}::uuid
          and not public.response_deletion_pending(f.workspace_id,f.session_id)`,
    );
    if (
      !row ||
      typeof row.object_key !== 'string' ||
      !keyPattern.test(row.object_key)
    )
      throw Error('FILE_NOT_FOUND');
    const [file] = fileRows([{ ...row, id: fileId, question_id: fileId }]);
    return {
      key: row.object_key,
      name: file.name,
      type: file.type,
      size: file.size,
    };
  });
}
