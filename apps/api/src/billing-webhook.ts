import { openDatabase } from '@snapform/database';
import { applyBillingEvent } from '@snapform/database/billing';
import {
  maxWebhookBody as limit,
  toBillingEvent,
  verifyRazorpaySignature,
} from '@snapform/contracts/razorpay';
import type { BillingEvent } from '@snapform/contracts/billing-server';
import { razorpayConfig } from './razorpay.ts';
import type { AuthEnvironment } from './environment.ts';

export const razorpayWebhookPath = '/api/v1/billing/razorpay/webhook';
type Apply = (
  event: BillingEvent,
) => Promise<'applied' | 'ignored' | 'duplicate'>;
function reply(status: number, body: unknown, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}
/** Reads at most limit bytes; null when the body is larger. */
async function readBounded(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > limit) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  for (let part = await reader?.read(); part && !part.done;) {
    size += part.value.byteLength;
    if (size > limit) {
      await reader?.cancel();
      return null;
    }
    chunks.push(part.value);
    part = await reader?.read();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
function persist(environment: AuthEnvironment): Apply {
  return async (event) => {
    if (!environment.DATABASE_URL) throw Error('Database unavailable');
    const { db, close } = await openDatabase(environment.DATABASE_URL);
    try {
      return await applyBillingEvent(db, event);
    } finally {
      await close();
    }
  };
}
/**
 * Razorpay webhook: read at most 1 MiB, verify X-Razorpay-Signature over those
 * raw bytes (Web Crypto, constant time), dedupe by X-Razorpay-Event-Id in the
 * database, and only then change a plan. The event ID header is not signed, so
 * apply_billing_event also keeps state monotonic: a replayed or late event
 * cannot move a plan backwards. Unknown or foreign events are recorded as
 * ignored and acknowledged; storage failures ask for a retry. Logs carry only
 * the event type, never IDs, customer or payment data.
 */
export async function handleRazorpayWebhook(
  request: Request,
  environment: AuthEnvironment,
  apply: Apply = persist(environment),
) {
  if (request.method !== 'POST')
    return reply(
      405,
      { error: { code: 'METHOD_NOT_ALLOWED' } },
      {
        Allow: 'POST',
      },
    );
  const config = razorpayConfig(environment);
  if (!config) return reply(503, { error: { code: 'BILLING_NOT_CONFIGURED' } });
  const body = await readBounded(request);
  if (!body) return reply(413, { error: { code: 'INVALID_EVENT' } });
  if (
    !(await verifyRazorpaySignature(
      body,
      request.headers.get('x-razorpay-signature'),
      config.webhookSecret,
    ))
  )
    return reply(401, { error: { code: 'SIGNATURE_INVALID' } });
  let event: BillingEvent | null = null;
  try {
    event = toBillingEvent(
      request.headers.get('x-razorpay-event-id'),
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)),
      config.plans,
    );
  } catch {
    // A signed but unreadable body is answered below as an invalid event.
  }
  if (!event) {
    // Signed by Razorpay but not in its documented shape; nothing from it is logged.
    console.warn(JSON.stringify({ event: 'billing_event_invalid' }));
    return reply(400, { error: { code: 'INVALID_EVENT' } });
  }
  try {
    return reply(200, { outcome: await apply(event) });
  } catch {
    console.error(
      JSON.stringify({ event: 'billing_event_unconfirmed', type: event.type }),
    );
    return reply(503, { error: { code: 'BILLING_EVENT_UNCONFIRMED' } });
  }
}
