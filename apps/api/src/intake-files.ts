import { openDatabase } from '@snapform/database';
import {
  authorizeUpload,
  listUploads,
  recordUpload,
  removeUpload,
} from '@snapform/database/uploads';
import {
  MAX_UPLOAD_BYTES,
  isUploadType,
  uploadedFileSchema,
} from '@snapform/contracts/uploads';
import type { UploadType } from '@snapform/contracts/uploads';
import {
  MAX_MANIFEST_BYTES,
  SIGNATURE_BYTES,
  ZIP_TAIL_BYTES,
  cleanFileName,
  isOfficeType,
  localDataOffset,
  matchesSignature,
  officeManifest,
  officeManifestMatches,
  readZipDirectory,
  textCheck,
  uploadKind,
} from '@snapform/contracts/upload-checks';
import type { ZipEntry } from '@snapform/contracts/upload-checks';
import { intakeAuthorizationHash } from './intake-capability.ts';
import { requestObservation } from './request-observation.ts';
import type { AuthEnvironment } from './environment.ts';

// Respondent files bypass Express so request bodies stream straight to R2.
// One file per request; the bearer capability is the only credential.
const uuid =
  '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';
const pattern = new RegExp(
  `^/api/v1/public/forms/${uuid}/sessions/${uuid}/(?:questions/${uuid}/files|files(?:/${uuid})?)$`,
);
export type IntakeFileRoute = {
  publicId: string;
  sessionId: string;
  questionId?: string;
  fileId?: string;
  methods: string[];
};
export function matchIntakeFileRoute(path: string): IntakeFileRoute | null {
  const match = path.match(pattern);
  if (!match) return null;
  const [, publicId, sessionId, questionId, fileId] = match.map((part) =>
    part?.toLowerCase(),
  );
  return {
    publicId,
    sessionId,
    questionId,
    fileId,
    methods: questionId ? ['POST'] : fileId ? ['DELETE'] : ['GET'],
  };
}
type Environment = Pick<
  Env & AuthEnvironment,
  | 'DATABASE_URL'
  | 'UPLOADS'
  | 'INTAKE_IP_WRITE_RATE_LIMIT'
  | 'INTAKE_WRITE_RATE_LIMIT'
  | 'PUBLIC_READ_RATE_LIMIT'
>;
type Dependencies = {
  environment: Environment;
  open?: typeof openDatabase;
};
class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
const outcomes: Record<string, [number, string]> = {
  INTAKE_UNAVAILABLE: [404, 'INTAKE_UNAVAILABLE'],
  INTAKE_ALREADY_SUBMITTED: [409, 'INTAKE_ALREADY_SUBMITTED'],
  UPLOADS_UNAVAILABLE: [403, 'UPLOADS_UNAVAILABLE'],
  FILE_QUESTION_UNAVAILABLE: [422, 'FILE_QUESTION_UNAVAILABLE'],
  FILE_LIMIT_REACHED: [409, 'FILE_LIMIT_REACHED'],
  INVALID_FILE: [422, 'INVALID_FILE'],
};
const refuse = (outcome: string) => {
  const [status, code] = Object.hasOwn(outcomes, outcome)
    ? outcomes[outcome]
    : [503, 'INTAKE_UNAVAILABLE'];
  return new Refusal(status, code);
};

export async function handleIntakeFile(
  request: Request,
  route: IntakeFileRoute,
  dependencies: Dependencies,
): Promise<Response> {
  const started = performance.now(),
    requestId = crypto.randomUUID();
  let response: Response;
  try {
    response = await respond(request, route, dependencies);
  } catch (error) {
    response =
      error instanceof Refusal
        ? json(error.status, { error: { code: error.code } })
        : json(500, { error: { code: 'INTERNAL_ERROR' } });
    if (!(error instanceof Refusal))
      console.error(JSON.stringify({ event: 'intake_file_failed', requestId }));
  }
  response.headers.set('X-Request-Id', requestId);
  // Same allowlisted shape as every other request: no path, name or key.
  console.log(
    JSON.stringify(
      requestObservation({
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: performance.now() - started,
        completed: true,
      }),
    ),
  );
  return response;
}
function json(status: number, body: unknown, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      ...headers,
    },
  });
}
async function respond(
  request: Request,
  route: IntakeFileRoute,
  { environment, open = openDatabase }: Dependencies,
) {
  if (!route.methods.includes(request.method))
    return json(
      405,
      { error: { code: 'METHOD_NOT_ALLOWED' } },
      { Allow: route.methods.join(', ') },
    );
  const address = request.headers.get('cf-connecting-ip') || 'local';
  const reading = request.method === 'GET';
  const limiter = reading
    ? environment.PUBLIC_READ_RATE_LIMIT
    : environment.INTAKE_IP_WRITE_RATE_LIMIT;
  const hash = await intakeAuthorizationHash(
    request.headers.get('authorization') ?? undefined,
  );
  if (
    !(await limiter.limit({ key: address })).success ||
    (hash &&
      !reading &&
      !(
        await environment.INTAKE_WRITE_RATE_LIMIT.limit({
          key: 'session:' + route.publicId + ':' + hash,
        })
      ).success)
  )
    return json(
      429,
      { error: { code: 'RATE_LIMITED' } },
      { 'Retry-After': '60' },
    );
  if (!hash) throw new Refusal(401, 'INTAKE_UNAVAILABLE');
  const upload = route.questionId
    ? readDeclaration(request, route.questionId)
    : null;
  if (!environment.DATABASE_URL || !environment.UPLOADS)
    throw new Refusal(503, 'UPLOADS_UNAVAILABLE');
  const bucket = environment.UPLOADS;
  const withDatabase = async <T>(
    run: (db: Awaited<ReturnType<typeof openDatabase>>['db']) => Promise<T>,
  ) => {
    const { db, close } = await open(environment.DATABASE_URL);
    try {
      return await run(db);
    } finally {
      await close();
    }
  };
  const { publicId, sessionId } = route;
  if (request.method === 'GET') {
    try {
      const files = await withDatabase((db) =>
        listUploads(db, publicId, sessionId, hash),
      );
      return json(200, { files });
    } catch (error) {
      if (error instanceof Error && error.message === 'INTAKE_UNAVAILABLE')
        throw refuse(error.message);
      throw error;
    }
  }
  if (request.method === 'DELETE' && route.fileId) {
    const fileId = route.fileId;
    let key: string | null;
    try {
      key = await withDatabase((db) =>
        removeUpload(db, publicId, sessionId, hash, fileId),
      );
    } catch (error) {
      if (error instanceof Error && Object.hasOwn(outcomes, error.message))
        throw refuse(error.message);
      throw error;
    }
    if (!key) throw new Refusal(404, 'FILE_NOT_FOUND');
    await deleteObject(bucket, key);
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  if (!upload || !request.body) throw new Refusal(422, 'INVALID_FILE');
  const slot = await withDatabase((db) =>
    authorizeUpload(db, publicId, sessionId, hash, upload.questionId),
  );
  if (!('workspaceId' in slot)) throw refuse(slot.outcome);
  const key = `${slot.workspaceId}/${slot.formId}/${sessionId}/${randomKey()}`;
  const inspector = inspect(upload.type, upload.size),
    fixed = new FixedLengthStream(upload.size);
  // R2 can commit once it has the declared bytes, before the end-of-file
  // checks run, so an object is kept only when the whole pipe succeeded.
  // Explicit pipes, so every failure is observed here and none goes unhandled.
  const results = await Promise.allSettled([
    bucket.put(key, fixed.readable, {
      httpMetadata: {
        contentType: upload.type,
        contentDisposition: 'attachment',
      },
    }),
    request.body.pipeTo(inspector.stream.writable),
    inspector.stream.readable.pipeTo(fixed.writable),
  ]);
  if (results.some((result) => result.status === 'rejected')) {
    // Even a rejected put may have committed the declared bytes.
    await deleteObject(bucket, key);
    throw inspector.refusal() ?? new Refusal(400, 'UPLOAD_INCOMPLETE');
  }
  let recorded = false;
  try {
    const manifest = inspector.manifest();
    if (
      manifest &&
      !(await manifestMatches(bucket, key, manifest, upload.type))
    )
      throw new Refusal(422, 'FILE_TYPE_MISMATCH');
    const file = {
      id: crypto.randomUUID(),
      questionId: upload.questionId,
      key,
      name: upload.name,
      type: upload.type,
      size: upload.size,
      sha256: await inspector.sha256(),
    };
    const outcome = await withDatabase((db) =>
      recordUpload(db, publicId, sessionId, hash, file),
    );
    if (outcome !== 'ok') throw refuse(outcome);
    recorded = true;
    return json(201, {
      file: uploadedFileSchema.parse({
        id: file.id,
        questionId: file.questionId,
        name: file.name,
        size: file.size,
        type: file.type,
      }),
    });
  } finally {
    if (!recorded) await deleteObject(bucket, key);
  }
}
/** A failed delete leaves bytes under the session prefix for its purge. */
async function deleteObject(bucket: R2Bucket, key: string) {
  try {
    await bucket.delete(key);
  } catch {
    console.error(JSON.stringify({ event: 'intake_file_delete_failed' }));
  }
}
/** Declared type, size and name, checked before any database or storage work. */
function readDeclaration(request: Request, questionId: string) {
  const type = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!isUploadType(type)) throw new Refusal(415, 'UNSUPPORTED_FILE_TYPE');
  const length = request.headers.get('content-length');
  if (!length || !/^\d{1,9}$/.test(length))
    throw new Refusal(411, 'LENGTH_REQUIRED');
  const size = Number(length);
  if (size > MAX_UPLOAD_BYTES) throw new Refusal(413, 'FILE_TOO_LARGE');
  if (size < 1) throw new Refusal(422, 'EMPTY_FILE');
  // The name travels percent-encoded in a header, never in the URL.
  const encoded = request.headers.get('x-file-name') ?? '';
  let raw: string;
  try {
    if (!encoded || encoded.length > 2048) throw Error();
    raw = decodeURIComponent(encoded);
  } catch {
    throw new Refusal(422, 'INVALID_FILE_NAME');
  }
  return { questionId, type, size, name: cleanFileName(raw, type) };
}
function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
/**
 * Checks bytes while they stream: the size never passes the declared length,
 * the signature must match, text stays NUL-free UTF-8 and Office files keep
 * their central directory for a check at the end. Also hashes with SHA-256.
 */
// Workers' streaming Web Crypto digest; the shared tsconfig types `crypto` from Node.
const { DigestStream: Digest } = crypto as unknown as {
  DigestStream: typeof DigestStream;
};
function inspect(type: UploadType, size: number) {
  const kind = uploadKind(type),
    text = kind === 'text' ? textCheck() : null,
    head = new Uint8Array(SIGNATURE_BYTES),
    tail: Uint8Array[] = [],
    digest = new Digest('SHA-256'),
    writer = digest.getWriter();
  let seen = 0,
    headLength = 0,
    tailLength = 0,
    refused: Refusal | null = null,
    manifest: ZipEntry | null = null;
  const fail = (status: number, code: string) => {
    refused = new Refusal(status, code);
    throw refused;
  };
  const signature = () =>
    matchesSignature(head.subarray(0, headLength), type) ||
    fail(422, 'FILE_TYPE_MISMATCH');
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > size) fail(413, 'FILE_TOO_LARGE');
      if (headLength < SIGNATURE_BYTES) {
        const part = chunk.subarray(0, SIGNATURE_BYTES - headLength);
        head.set(part, headLength);
        headLength += part.byteLength;
        if (headLength === Math.min(SIGNATURE_BYTES, size)) signature();
      }
      if (text && !text.push(chunk)) fail(422, 'FILE_TYPE_MISMATCH');
      if (kind === 'office') {
        tail.push(chunk);
        tailLength += chunk.byteLength;
        while (tailLength - tail[0].byteLength >= ZIP_TAIL_BYTES)
          tailLength -= tail.shift()?.byteLength ?? 0;
      }
      await writer.write(chunk);
      controller.enqueue(chunk);
    },
    async flush() {
      if (seen !== size) fail(400, 'UPLOAD_INCOMPLETE');
      if (text && !text.end()) fail(422, 'FILE_TYPE_MISMATCH');
      if (kind === 'office') {
        const bytes = new Uint8Array(tailLength);
        let offset = 0;
        for (const part of tail) {
          bytes.set(part, offset);
          offset += part.byteLength;
        }
        const entries = readZipDirectory(bytes, seen);
        manifest =
          entries && isOfficeType(type) ? officeManifest(entries, type) : null;
        if (!manifest) fail(422, 'FILE_TYPE_MISMATCH');
      }
      await writer.close();
    },
  });
  return {
    stream,
    refusal: () => refused,
    manifest: () => manifest,
    sha256: async () =>
      Array.from(new Uint8Array(await digest.digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
  };
}
/** Reads the stored manifest back from R2 and checks its content types. */
async function manifestMatches(
  bucket: R2Bucket,
  key: string,
  entry: ZipEntry,
  type: UploadType,
) {
  if (entry.compressedSize < 1) return false;
  const header = await bucket.get(key, {
    range: { offset: entry.offset, length: 30 },
  });
  const start =
    header && localDataOffset(new Uint8Array(await header.arrayBuffer()));
  if (!start) return false;
  const data = await bucket.get(key, {
    range: { offset: entry.offset + start, length: entry.compressedSize },
  });
  if (!data) return false;
  const body =
    entry.method === 8
      ? data.body.pipeThrough(new DecompressionStream('deflate-raw'))
      : data.body;
  // Bounded read: a manifest that inflates past 1 MiB is refused.
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let length = 0,
    xml = '';
  try {
    for (
      let part = await reader.read();
      !part.done;
      part = await reader.read()
    ) {
      length += part.value.byteLength;
      if (length > MAX_MANIFEST_BYTES) {
        await reader.cancel();
        return false;
      }
      xml += decoder.decode(part.value, { stream: true });
    }
  } catch {
    return false;
  }
  return (
    isOfficeType(type) && officeManifestMatches(xml + decoder.decode(), type)
  );
}
