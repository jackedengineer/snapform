import { responseEventMessageSchema } from '@snapform/contracts/response-event';

function reply(
  status: number,
  body?: { claimed: number; acknowledged: number; failed: number },
) {
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
// This route is reachable only through the private Jobs service binding.
export async function handleWebhookWake(
  request: Request,
  dispatch: (
    id: string,
  ) => Promise<{ claimed: number; acknowledged: number; failed: number }>,
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
  let id: string;
  const reader = request.body?.getReader();
  if (!reader) return reply(422);
  try {
    const bytes = new Uint8Array(512);
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 512) return reply(413);
      bytes.set(part.value, size - part.value.byteLength);
    }
    id = responseEventMessageSchema.parse(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          bytes.subarray(0, size),
        ),
      ),
    ).eventId;
  } catch {
    return reply(422);
  } finally {
    await reader.cancel().catch(() => {
      console.warn(
        JSON.stringify({ event: 'webhook_wake_body_cancel_failed' }),
      );
    });
  }
  try {
    const { claimed, acknowledged, failed } = await dispatch(id);
    return failed ? reply(503) : reply(200, { claimed, acknowledged, failed });
  } catch {
    console.error(JSON.stringify({ event: 'webhook_wake_failed' }));
    return reply(503);
  }
}
