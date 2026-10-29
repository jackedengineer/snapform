import { verifyProviderSignature } from '@snapform/contracts/provider-signature';
import { readProviderReceipt } from '@snapform/contracts/provider-receipt';
import type { ProviderEmailReceipt } from '@snapform/contracts/provider-receipt';
function reply(status: number) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
  });
  if (status === 405) headers.set('Allow', 'POST');
  if (status === 503) headers.set('Retry-After', '60');
  return new Response(null, { status, headers });
}
async function rawBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32768) throw RangeError('BODY_TOO_LARGE');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    bytes,
  );
}
export async function handleProviderReceipt(
  request: Request,
  secret: string,
  record: (receipt: ProviderEmailReceipt) => Promise<boolean>,
): Promise<Response> {
  if (request.method !== 'POST') return reply(405);
  if (!secret) return reply(503);
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !==
      'application/json' ||
    (request.headers.has('Content-Encoding') &&
      request.headers.get('Content-Encoding') !== 'identity')
  )
    return reply(415);
  let raw: string;
  try {
    raw = await rawBody(request);
  } catch (error) {
    return reply(error instanceof RangeError ? 413 : 400);
  }
  if (
    !(await verifyProviderSignature(
      raw,
      {
        id: request.headers.get('svix-id') || '',
        timestamp: request.headers.get('svix-timestamp') || '',
        signature: request.headers.get('svix-signature') || '',
      },
      secret,
    ))
  )
    return reply(401);
  let receipt: ProviderEmailReceipt | null;
  try {
    receipt = readProviderReceipt(JSON.parse(raw));
  } catch {
    return reply(400);
  }
  if (!receipt) return reply(204);
  try {
    const recorded = await record(receipt);
    console.log(JSON.stringify({ event: 'owner_email_receipt', recorded }));
    return reply(204);
  } catch {
    console.error(JSON.stringify({ event: 'provider_receipt_record_failed' }));
    return reply(503);
  }
}
