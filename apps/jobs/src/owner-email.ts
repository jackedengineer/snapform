import { responseEventMessageSchema } from '@snapform/contracts/response-event';
const identity = responseEventMessageSchema.shape.eventId;
export type OwnerEmail = {
  id: string;
  workspaceId: string;
  formId: string;
  sessionId: string;
  recipient: string;
  firstAttemptAt: string;
};
export type EmailOutcome =
  | { status: 'accepted'; providerId: string }
  | { status: 'retry'; reason: 'provider-unavailable'; delaySeconds: number }
  | {
      status: 'needs_action';
      reason: 'configuration' | 'provider-rejected' | 'idempotency-expired';
    };
async function providerResult(response: Response): Promise<unknown> {
  if (!response.body) throw Error('Missing provider response');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let bytes = 0,
    text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) throw Error('Oversized provider response');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel();
  }
}
export async function sendOwnerEmail(
  delivery: OwnerEmail,
  settings: { apiKey: string; from: string; allowedRecipient?: string },
  now = Date.now(),
  transport: typeof fetch = fetch,
): Promise<EmailOutcome> {
  const started = Date.parse(delivery.firstAttemptAt);
  if (
    !settings.apiKey ||
    !settings.from ||
    /[\r\n]/.test(settings.from + delivery.recipient) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(delivery.recipient) ||
    (settings.allowedRecipient &&
      delivery.recipient.toLowerCase() !==
        settings.allowedRecipient.toLowerCase()) ||
    ![
      delivery.id,
      delivery.workspaceId,
      delivery.formId,
      delivery.sessionId,
    ].every((value) => identity.safeParse(value).success) ||
    !Number.isFinite(started) ||
    started > now + 60000
  )
    return { status: 'needs_action', reason: 'configuration' };
  // Stop conservatively before the provider's 24-hour idempotency expiry.
  if (now - started >= 23 * 3600000)
    return { status: 'needs_action', reason: 'idempotency-expired' };
  const retry = (delaySeconds = 60): EmailOutcome => ({
    status: 'retry',
    reason: 'provider-unavailable',
    delaySeconds,
  });
  try {
    const response = await transport('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `response-owner-v1-${delivery.id}`,
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: settings.from,
        to: [delivery.recipient],
        subject: 'A new response is ready in Snapform',
        text: `A new response is ready in Snapform.\n\nOpen your inbox:\nhttps://snapform.jacked.dev/workspaces/${delivery.workspaceId}/responses/${delivery.formId}?response=${delivery.sessionId}\n\nReference: ${delivery.sessionId}\n\nYou receive this because response notifications are enabled for this form. Manage them from the inbox.\n\nSnapform`,
      }),
    });
    if (
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      const raw = response.headers.get('Retry-After') || '';
      const seconds = /^\d+$/.test(raw)
        ? Number(raw)
        : (Date.parse(raw) - now) / 1000;
      await response.body?.cancel();
      return retry(
        Number.isFinite(seconds)
          ? Math.min(3600, Math.max(60, Math.ceil(seconds)))
          : 60,
      );
    }
    if (!response.ok) {
      if (response.status === 409) {
        let result: unknown;
        try {
          result = await providerResult(response);
        } catch {
          return { status: 'needs_action', reason: 'provider-rejected' };
        }
        if (
          typeof result === 'object' &&
          result !== null &&
          'name' in result &&
          result.name === 'concurrent_idempotent_requests'
        )
          return retry();
      } else await response.body?.cancel();
      return { status: 'needs_action', reason: 'provider-rejected' };
    }
    const result = await providerResult(response);
    if (
      typeof result !== 'object' ||
      result === null ||
      !('id' in result) ||
      !identity.safeParse(result.id).success
    )
      return retry();
    return { status: 'accepted', providerId: String(result.id) };
  } catch {
    // An unknown provider outcome retries the same immutable message/key only.
    return retry();
  }
}
