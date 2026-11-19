export type ResponseDelivery = {
  events: number;
  emails: number;
  webhooks: number;
  failed: number;
};
function reply(status: number, body?: ResponseDelivery) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(status === 405 ? { Allow: 'POST' } : {}),
    ...(status === 503 ? { 'Retry-After': '60' } : {}),
  };
  return body
    ? Response.json(body, { status, headers })
    : new Response(null, { status, headers });
}
// Reachable only through the API's private Jobs service binding. The API calls
// it right after a submit, while the database is already awake, so owner
// emails and webhooks go out at once instead of waiting for the sweep (Cron
// every 30 minutes), which lets the database sleep in between.
export async function handleResponseWake(
  request: Request,
  dispatch: () => Promise<ResponseDelivery>,
) {
  if (request.method !== 'POST') return reply(405);
  if (new URL(request.url).search) return reply(422);
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !==
      'application/json' ||
    (request.headers.has('Content-Encoding') &&
      request.headers.get('Content-Encoding') !== 'identity')
  )
    return reply(415);
  const reader = request.body?.getReader();
  if (!reader) return reply(422);
  try {
    const bytes = new Uint8Array(64);
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 64) return reply(413);
      bytes.set(part.value, size - part.value.byteLength);
    }
    const body: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)),
    );
    if (
      typeof body !== 'object' ||
      body === null ||
      Object.keys(body).join() !== 'version' ||
      (body as { version: unknown }).version !== 1
    )
      return reply(422);
  } catch {
    return reply(422);
  } finally {
    await reader.cancel().catch(() => {
      console.warn(
        JSON.stringify({ event: 'response_wake_body_cancel_failed' }),
      );
    });
  }
  try {
    const result = await dispatch();
    if (!result.failed) return reply(200, result);
  } catch {
    // Database and provider detail stays out of logs and replies.
  }
  console.error(JSON.stringify({ event: 'response_wake_failed' }));
  return reply(503);
}
