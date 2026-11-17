import {
  MAX_UPLOAD_BYTES,
  uploadTypeFor,
  uploadedFileSchema,
  uploadedFilesSchema,
} from '@snapform/contracts/uploads';
import type { UploadedFile } from '@snapform/contracts/uploads';
import type { IntakeIdentity } from './api';

// Respondent file requests use the session capability only. Names travel in a
// header, never in the URL. The server repeats every check made here.
export const filesPath = (publicId: string, sessionId: string) =>
  `/api/v1/public/forms/${encodeURIComponent(publicId)}/sessions/${encodeURIComponent(sessionId)}/files`;
const kinds = 'a PDF, image, Word, Excel, PowerPoint, text or CSV file';
/** The rejection message of an upload the respondent cancelled. */
export const cancelled = 'Upload cancelled.';
export function pickProblem(
  file: { name: string; type: string; size: number },
  room: number,
): string | null {
  if (room < 1) return 'You’ve added the most files this question allows.';
  if (!uploadTypeFor(file.name, file.type))
    return `“${file.name}” can’t be sent. Choose ${kinds}.`;
  if (file.size > MAX_UPLOAD_BYTES)
    return `“${file.name}” is larger than 25 MB.`;
  if (file.size < 1) return `“${file.name}” is empty.`;
  return null;
}
const messages: Record<string, string> = {
  FILE_TOO_LARGE: 'This file is larger than 25 MB.',
  UNSUPPORTED_FILE_TYPE: `This file can’t be sent. Choose ${kinds}.`,
  FILE_TYPE_MISMATCH: `This file’s contents don’t match its type. Choose ${kinds}.`,
  FILE_LIMIT_REACHED: 'You’ve added the most files this question allows.',
  UPLOADS_UNAVAILABLE:
    'File uploads aren’t available for this form right now. Contact whoever sent you the link.',
  INTAKE_ALREADY_SUBMITTED: 'This response has already been sent.',
};
export function uploadMessage(status: number, code: unknown): string {
  if (typeof code === 'string' && Object.hasOwn(messages, code))
    return messages[code];
  if (status === 401 || status === 404)
    return 'This form or saved session is no longer available.';
  if (status === 429) return 'Too many requests. Wait a minute, then retry.';
  return 'The file didn’t finish sending. Check your connection, then try again.';
}
const errorCode = (body: unknown) =>
  typeof body === 'object' &&
  body !== null &&
  'error' in body &&
  typeof body.error === 'object' &&
  body.error !== null &&
  'code' in body.error
    ? body.error.code
    : null;
async function call(path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw Error(uploadMessage(0, null));
  }
  return response;
}
export async function listFiles(
  publicId: string,
  identity: IntakeIdentity,
): Promise<UploadedFile[]> {
  const response = await call(filesPath(publicId, identity.id), {
    headers: { Authorization: 'Bearer ' + identity.capability },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw Error(uploadMessage(response.status, errorCode(body)));
  const files =
    typeof body === 'object' && body !== null && 'files' in body
      ? body.files
      : null;
  return uploadedFilesSchema.parse(files);
}
/** Removes a file; one that is already gone counts as removed. */
export async function removeFile(
  publicId: string,
  identity: IntakeIdentity,
  fileId: string,
) {
  const response = await call(
    `${filesPath(publicId, identity.id)}/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + identity.capability },
    },
  );
  if (response.ok || response.status === 404) return;
  const body: unknown = await response.json().catch(() => null);
  throw Error(uploadMessage(response.status, errorCode(body)));
}
/**
 * Sends one file with upload progress, which fetch cannot report. The browser
 * sets Content-Length from the file; the server stops at the declared size.
 */
export function sendFile(
  publicId: string,
  identity: IntakeIdentity,
  questionId: string,
  file: File,
  onProgress: (fraction: number) => void,
) {
  const request = new XMLHttpRequest();
  const done = new Promise<UploadedFile>((resolve, reject) => {
    const type = uploadTypeFor(file.name, file.type);
    if (!type) return reject(Error(messages.UNSUPPORTED_FILE_TYPE));
    request.open(
      'POST',
      `${filesPath(publicId, identity.id).replace(/\/files$/, '')}/questions/${encodeURIComponent(questionId)}/files`,
    );
    request.timeout = 10 * 60 * 1000;
    request.responseType = 'json';
    request.setRequestHeader('Authorization', 'Bearer ' + identity.capability);
    request.setRequestHeader('Content-Type', type);
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      const body: unknown = request.response;
      const parsed =
        request.status === 201 &&
        typeof body === 'object' &&
        body !== null &&
        'file' in body
          ? uploadedFileSchema.safeParse(body.file)
          : null;
      if (parsed?.success && parsed.data.questionId === questionId)
        resolve(parsed.data);
      else reject(Error(uploadMessage(request.status, errorCode(body))));
    };
    request.onerror = request.ontimeout = () =>
      reject(Error(uploadMessage(0, null)));
    request.onabort = () => reject(Error(cancelled));
    request.send(file);
  });
  return { done, abort: () => request.abort() };
}
