import { signWebhook } from '@snapform/contracts/webhook-crypto';
import { parseWebhookTarget } from '@snapform/contracts/webhook-target';
import { MAX_WEBHOOK_ATTEMPTS } from '@snapform/contracts/webhook-protocol';
import type { WebhookOutcome } from '@snapform/contracts/webhook-protocol';
export type WebhookSend = {
  id: string;
  url: string;
  secret: string;
  body: string;
  attempts: number;
};
function outcome(
  status: number,
  retryAfter: string,
  attempts: number,
  now: number,
  jitter: number,
): WebhookOutcome {
  if (status >= 200 && status < 300)
    return { status: 'acknowledged', httpStatus: status };
  if (status === 408)
    return {
      status: 'unknown',
      reason: 'receiver-unconfirmed',
      httpStatus: status,
    };
  if (status === 429 || status >= 500) {
    if (attempts >= MAX_WEBHOOK_ATTEMPTS)
      return {
        status: 'needs_action',
        reason: 'attempts-exhausted',
        httpStatus: status,
      };
    const raw = retryAfter.length <= 128 ? retryAfter.trim() : '';
    const requested = /^\d+$/.test(raw)
      ? Number(raw)
      : (Date.parse(raw) - now) / 1000;
    if (requested > 86400)
      return {
        status: 'needs_action',
        reason: 'retry-later',
        httpStatus: status,
      };
    const backoff = Math.min(
      3600,
      60 * 2 ** (attempts - 1) + Math.floor(jitter * 30),
    );
    return {
      status: 'retry',
      httpStatus: status,
      reason: status === 429 ? 'rate-limited' : 'receiver-unavailable',
      delaySeconds: Math.max(
        backoff,
        Number.isFinite(requested) ? Math.ceil(requested) : 0,
      ),
    };
  }
  return {
    status: 'needs_action',
    httpStatus: status,
    reason:
      status >= 300 && status < 400
        ? 'redirect-blocked'
        : status === 401 || status === 403
          ? 'authorization'
          : 'receiver-rejected',
  };
}
export async function sendWebhook(
  delivery: WebhookSend,
  now = Date.now(),
  transport: typeof fetch = fetch,
  jitter = Math.random(),
): Promise<WebhookOutcome> {
  let url: string, signed: Awaited<ReturnType<typeof signWebhook>>;
  try {
    if (
      !Number.isInteger(delivery.attempts) ||
      delivery.attempts < 1 ||
      delivery.attempts > MAX_WEBHOOK_ATTEMPTS ||
      !Number.isFinite(jitter) ||
      jitter < 0 ||
      jitter >= 1 ||
      typeof delivery.body !== 'string'
    )
      throw Error();
    url = parseWebhookTarget(delivery.url);
    signed = await signWebhook(
      delivery.id,
      delivery.body,
      delivery.secret,
      now,
    );
  } catch {
    return {
      status: 'needs_action',
      reason: 'configuration',
      httpStatus: null,
    };
  }
  let response: Response;
  try {
    response = await transport(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Snapform-Webhooks/1',
        'webhook-id': signed.id,
        'webhook-timestamp': signed.timestamp,
        'webhook-signature': signed.signature,
      },
      body: delivery.body,
    });
  } catch {
    return {
      status: 'unknown',
      reason: 'receiver-unconfirmed',
      httpStatus: null,
    };
  }
  const result = outcome(
    response.status,
    response.headers.get('Retry-After') ?? '',
    delivery.attempts,
    now,
    jitter,
  );
  try {
    await response.body?.cancel();
  } catch {
    // A response-body cleanup failure cannot erase an already received acknowledgment.
    console.warn(
      JSON.stringify({
        event: 'webhook_body_cancel_failed',
        deliveryId: delivery.id,
      }),
    );
  }
  return result;
}
