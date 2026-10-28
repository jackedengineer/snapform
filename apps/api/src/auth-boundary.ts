import { authBodies } from '@snapform/contracts/auth';

export const authFailure = (code: string, status: number) =>
  Response.json(
    { error: { code } },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Retry-After': status === 429 ? '60' : '0',
      },
    },
  );

// Read a bounded body even when Content-Length is missing or forged.
export async function checkAuthRequest(
  request: Request<unknown, IncomingRequestCfProperties>,
  allowedRecipient?: string,
): Promise<Request<unknown, IncomingRequestCfProperties> | Response> {
  const path = new URL(request.url).pathname.slice('/api/auth/'.length);
  if (
    request.method === 'GET' &&
    (path === 'verify-email' || /^reset-password\/[A-Za-z0-9_-]+$/.test(path))
  )
    return request;
  if (request.method !== 'POST' || !Object.hasOwn(authBodies, path))
    return authFailure('NOT_FOUND', 404);
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json') ||
    request.headers.has('content-encoding')
  )
    return authFailure('JSON_REQUIRED', 415);
  const reader = request.body?.getReader();
  if (!reader) return authFailure('INVALID_REQUEST', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return authFailure('REQUEST_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    const result = authBodies[path as keyof typeof authBodies].safeParse(body);
    if (!result.success) return authFailure('INVALID_AUTH_INPUT', 422);
    if (
      allowedRecipient &&
      'email' in result.data &&
      result.data.email !== allowedRecipient.toLowerCase()
    )
      return authFailure('RECIPIENT_NOT_ALLOWED', 403);
    const headers = new Headers(request.headers);
    const encoded = JSON.stringify(result.data);
    headers.delete('transfer-encoding');
    // The HTTP/1 Node adapter needs an accurate byte length after normalization.
    headers.set(
      'content-length',
      String(new TextEncoder().encode(encoded).byteLength),
    );
    // The native copy preserves incoming cf metadata; Node’s merged Request overload loses its type.
    return new Request(request, {
      headers,
      body: encoded,
    }) as Request<unknown, IncomingRequestCfProperties>;
  } catch {
    return authFailure('INVALID_REQUEST', 400);
  }
}
