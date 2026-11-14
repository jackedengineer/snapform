import { afterEach, expect, it, vi } from 'vitest';
import {
  cancelled,
  filesPath,
  listFiles,
  pickProblem,
  removeFile,
  sendFile,
  uploadMessage,
} from './files';
import { newIntakeIdentity } from './identity';
afterEach(() => vi.unstubAllGlobals());
const publicId = crypto.randomUUID(),
  questionId = crypto.randomUUID(),
  identity = newIntakeIdentity();
const stored = {
  id: crypto.randomUUID(),
  questionId,
  name: 'Brief.pdf',
  size: 2048,
  type: 'application/pdf',
};

it('explains too many, wrong, empty and oversized files before sending', () => {
  const pdf = { name: 'Brief.pdf', type: 'application/pdf', size: 10 };
  expect(pickProblem(pdf, 1)).toBeNull();
  expect(pickProblem(pdf, 0)).toBe(
    'You’ve added the most files this question allows.',
  );
  expect(pickProblem({ ...pdf, name: 'setup.exe', type: '' }, 1)).toBe(
    '“setup.exe” can’t be sent. Choose a PDF, image, Word, Excel, PowerPoint, text or CSV file.',
  );
  expect(pickProblem({ ...pdf, type: 'text/html' }, 1)).toMatch(
    /can’t be sent/,
  );
  expect(pickProblem({ ...pdf, size: 25 * 1024 * 1024 + 1 }, 1)).toBe(
    '“Brief.pdf” is larger than 25 MB.',
  );
  expect(pickProblem({ ...pdf, size: 0 }, 1)).toBe('“Brief.pdf” is empty.');
});
it('maps server refusals to plain messages without echoing input', () => {
  expect(uploadMessage(413, 'FILE_TOO_LARGE')).toBe(
    'This file is larger than 25 MB.',
  );
  expect(uploadMessage(422, 'FILE_TYPE_MISMATCH')).toMatch(
    /contents don’t match/,
  );
  expect(uploadMessage(403, 'UPLOADS_UNAVAILABLE')).toMatch(/aren’t available/);
  expect(uploadMessage(409, 'FILE_LIMIT_REACHED')).toMatch(/most files/);
  expect(uploadMessage(404, 'INTAKE_UNAVAILABLE')).toMatch(
    /no longer available/,
  );
  expect(uploadMessage(429, 'RATE_LIMITED')).toMatch(/Wait a minute/);
  expect(uploadMessage(500, 'toString')).toMatch(/didn’t finish/);
  expect(uploadMessage(0, null)).toMatch(/Check your connection/);
});
it('lists and removes with the capability header only, never cookies or URL secrets', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ files: [stored] }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      Response.json({ error: { code: 'INTAKE_UNAVAILABLE' } }, { status: 404 }),
    )
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: 'INTAKE_ALREADY_SUBMITTED' } },
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ files: [{ ...stored, key: 'x' }] }))
    .mockRejectedValueOnce(TypeError('offline'));
  vi.stubGlobal('fetch', fetcher);
  expect(await listFiles(publicId, identity)).toEqual([stored]);
  expect(fetcher.mock.calls[0][0]).toBe(filesPath(publicId, identity.id));
  expect(fetcher.mock.calls[0][0]).not.toContain(identity.capability);
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + identity.capability },
  });
  await removeFile(publicId, identity, stored.id);
  expect(fetcher.mock.calls[1][0]).toBe(
    `${filesPath(publicId, identity.id)}/${stored.id}`,
  );
  expect(fetcher.mock.calls[1][1].method).toBe('DELETE');
  // Already gone counts as removed.
  await removeFile(publicId, identity, stored.id);
  await expect(removeFile(publicId, identity, stored.id)).rejects.toThrow(
    'This response has already been sent.',
  );
  await expect(listFiles(publicId, identity)).rejects.toThrow();
  await expect(listFiles(publicId, identity)).rejects.toThrow(
    /Check your connection/,
  );
});

// A minimal XMLHttpRequest double: records what the client sends.
class FakeRequest {
  static last: FakeRequest;
  headers: Record<string, string> = {};
  method = '';
  url = '';
  body: unknown;
  status = 0;
  response: unknown = null;
  timeout = 0;
  responseType = '';
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  constructor() {
    FakeRequest.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  finish(status: number, response: unknown) {
    this.status = status;
    this.response = response;
    this.onload?.();
  }
}
it('sends one file with its declared type, encoded name and progress', async () => {
  vi.stubGlobal('XMLHttpRequest', FakeRequest);
  const file = new File(['%PDF-1.7'], 'تقرير ✓.pdf', { type: '' });
  const progress: number[] = [];
  const upload = sendFile(publicId, identity, questionId, file, (fraction) =>
    progress.push(fraction),
  );
  const request = FakeRequest.last;
  expect(request.method).toBe('POST');
  expect(request.url).toBe(
    `/api/v1/public/forms/${publicId}/sessions/${identity.id}/questions/${questionId}/files`,
  );
  expect(request.url).not.toContain('pdf');
  expect(request.headers).toEqual({
    Authorization: 'Bearer ' + identity.capability,
    'Content-Type': 'application/pdf',
    'X-File-Name': encodeURIComponent('تقرير ✓.pdf'),
  });
  expect(request.body).toBe(file);
  request.upload.onprogress?.({
    lengthComputable: true,
    loaded: 4,
    total: 8,
  } as ProgressEvent);
  request.upload.onprogress?.({
    lengthComputable: false,
    loaded: 4,
    total: 0,
  } as ProgressEvent);
  request.finish(201, { file: stored });
  expect(await upload.done).toEqual(stored);
  expect(progress).toEqual([0.5]);
});
it('rejects refusals, mismatched receipts, network failures and cancellation', async () => {
  vi.stubGlobal('XMLHttpRequest', FakeRequest);
  const file = new File(['x'], 'Brief.pdf', { type: 'application/pdf' });
  const send = () => sendFile(publicId, identity, questionId, file, () => {});
  let upload = send();
  FakeRequest.last.finish(413, { error: { code: 'FILE_TOO_LARGE' } });
  await expect(upload.done).rejects.toThrow('This file is larger than 25 MB.');
  upload = send();
  FakeRequest.last.finish(201, {
    file: { ...stored, questionId: crypto.randomUUID() },
  });
  await expect(upload.done).rejects.toThrow(/didn’t finish/);
  upload = send();
  FakeRequest.last.onerror?.();
  await expect(upload.done).rejects.toThrow(/Check your connection/);
  upload = send();
  upload.abort();
  await expect(upload.done).rejects.toThrow(cancelled);
  await expect(
    sendFile(
      publicId,
      identity,
      questionId,
      new File(['x'], 'logo.svg', { type: 'image/svg+xml' }),
      () => {},
    ).done,
  ).rejects.toThrow(/can’t be sent/);
});
