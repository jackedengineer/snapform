import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import { getResponseFile, listResponseFiles } from '@snapform/database/uploads';
import { attachmentDisposition } from '@snapform/contracts/upload-checks';
import { createWorkspaceSchema } from '@snapform/contracts/workspace';
import { requestScope } from './request-context.ts';
const identity = createWorkspaceSchema.shape.id;
type FilesRoute = {
  workspaceId: string;
  formId: string;
  responseId: string;
  fileId?: string;
};
export function matchResponseFilesRoute(path: string): FilesRoute | null {
  const match = path.match(
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/forms\/([A-Fa-f0-9-]{36})\/responses\/([A-Fa-f0-9-]{36})\/files(?:\/([A-Fa-f0-9-]{36}))?$/,
  );
  if (!match) return null;
  const [workspace, form, response] = [match[1], match[2], match[3]].map(
    (part) => identity.safeParse(part),
  );
  const file = match[4] ? identity.safeParse(match[4]) : undefined;
  if (!workspace.success || !form.success || !response.success) return null;
  if (file && !file.success) return null;
  return {
    workspaceId: workspace.data,
    formId: form.data,
    responseId: response.data,
    fileId: file?.data,
  };
}
const failures: Record<string, number> = {
  WORKSPACE_NOT_FOUND: 404,
  FILE_NOT_FOUND: 404,
  FORBIDDEN: 403,
};
/**
 * Members (owner, editor, viewer) list a submitted response's files and
 * download them through this route only: always as an attachment with
 * nosniff, never inline, never from a public or signed bucket URL.
 */
export async function handleResponseFiles(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: FilesRoute,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  const scope = requestScope.getStore();
  if (!scope) throw Error('Request scope required');
  if (req.get('sec-fetch-site') === 'cross-site') {
    res.status(403).json({ error: { code: 'ORIGIN_REJECTED' } });
    return;
  }
  const { workspaceId, formId, responseId, fileId } = route;
  try {
    if (!fileId) {
      res.json({
        files: await listResponseFiles(
          db,
          actor,
          workspaceId,
          formId,
          responseId,
        ),
      });
      return;
    }
    const bucket = scope.environment.UPLOADS;
    if (!bucket) {
      res.status(503).json({ error: { code: 'FILES_UNAVAILABLE' } });
      return;
    }
    const file = await getResponseFile(
      db,
      actor,
      workspaceId,
      formId,
      responseId,
      fileId,
    );
    const object = await bucket.get(file.key);
    if (!object) {
      console.error(JSON.stringify({ event: 'response_file_missing' }));
      throw Error('FILE_NOT_FOUND');
    }
    res.status(200).set({
      'Content-Type': file.type,
      'Content-Length': String(object.size),
      'Content-Disposition': attachmentDisposition(file.name),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'private, no-store',
    });
    await pipeline(
      Readable.fromWeb(object.body as import('node:stream/web').ReadableStream),
      res,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (res.headersSent || !Object.hasOwn(failures, code)) throw error;
    res.status(failures[code]).json({
      error: { code: code === 'WORKSPACE_NOT_FOUND' ? 'NOT_FOUND' : code },
    });
  }
}
