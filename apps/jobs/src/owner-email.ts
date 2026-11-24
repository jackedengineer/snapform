import { responseEventMessageSchema } from '@snapform/contracts/response-event';
import type { EmailOutcome } from '@snapform/contracts/notifications';
import type { OwnerEmailSummary } from '@snapform/database/notification-delivery';
const identity = responseEventMessageSchema.shape.eventId;
export type OwnerEmail = {
  id: string;
  workspaceId: string;
  formId: string;
  sessionId: string;
  recipient: string;
  firstAttemptAt: string;
  summary: OwnerEmailSummary;
};
// C0/C1 controls, line/paragraph separators and bidirectional overrides.
const unsafe =
  /[\p{Cc}\u2028\u2029\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
// One header-safe line of at most 120 characters, cut on code points.
function line(value: string | null) {
  const text = (value ?? '')
    .toWellFormed()
    .replace(unsafe, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(text);
  return characters.length > 120
    ? `${characters.slice(0, 119).join('').trimEnd()}…`
    : text;
}
// Inbox rule: the first answered name-like short text, else the email answer.
// The database selects both candidates so Jobs never reads other answers.
export function respondentLabel(name: string | null, email: string | null) {
  return line(name) || line(email) || null;
}
// Same address shape the email question accepts; anything else is not a header.
const mailbox =
  /^(?!\.)(?!.*\.\.)[A-Za-z0-9_'+\-.]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
function replyTo(email: string | null) {
  const address = email?.trim() ?? '';
  return address.length <= 254 && mailbox.test(address) ? address : null;
}
const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escape = (value: string) =>
  value.replace(/[&<>"']/g, (character) => entities[character]);
const utc = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});
// Workspaces have no stored locale or time zone yet, so the time is labelled UTC.
function renderOwnerEmail(delivery: OwnerEmail) {
  const { summary } = delivery,
    title = line(summary.formTitle) || 'Untitled form',
    respondent = respondentLabel(
      summary.respondentName,
      summary.respondentEmail,
    ),
    submitted = `${utc.format(new Date(summary.submittedAt))} UTC`,
    inbox = `https://snapform.jacked.dev/workspaces/${delivery.workspaceId}/responses/${delivery.formId}`,
    link = `${inbox}?response=${delivery.sessionId}`,
    subject = `New response: ${title}${respondent ? ` from ${respondent}` : ''}`,
    why =
      'You get this email because email notifications are on for this form. To turn them off, open';
  const rows = [
    ['Form', escape(title)],
    ['Respondent', escape(respondent ?? 'Not provided')],
    [
      'Submitted',
      `<time datetime="${escape(summary.submittedAt)}">${escape(submitted)}</time>`,
    ],
  ]
    .map(
      ([label, value]) =>
        `<tr><th scope="row" style="padding:8px 16px 8px 0;text-align:left;vertical-align:top;font-weight:600;color:#4F5563;white-space:nowrap">${label}</th><td style="padding:8px 0;color:#13151A;word-break:break-word">${value}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title></head><body style="margin:0;padding:0;background:#F6F7F9;color:#13151A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E3E6EC;border-radius:20px"><tr><td style="padding:32px"><p style="margin:0 0 24px;font-weight:700;color:#2B4CFF">Snapform</p><h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#13151A">New response</h1><table cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse">${rows}</table><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2B4CFF;color:#FFFFFF;font-weight:600;text-decoration:none">Open response</a><p style="margin:32px 0 0;font-size:14px;color:#4F5563">${why} <a href="${escape(inbox)}" style="color:#2B4CFF">the form’s responses</a> in Snapform and switch off Email notifications.</p></td></tr></table></td></tr></table></body></html>`;
  const text = `${subject}\n\nForm: ${title}\nRespondent: ${respondent ?? 'Not provided'}\nSubmitted: ${submitted}\n\nOpen response:\n${link}\n\n${why} the form’s responses in Snapform and switch off Email notifications:\n${inbox}\n\nSnapform`;
  const address = replyTo(summary.respondentEmail);
  return { subject, html, text, ...(address ? { reply_to: address } : {}) };
}
export async function boundedJson(response: Response): Promise<unknown> {
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
    !Number.isFinite(Date.parse(delivery.summary.submittedAt)) ||
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
        tags: [{ name: 'snapform_delivery', value: delivery.id }],
        ...renderOwnerEmail(delivery),
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
          result = await boundedJson(response);
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
    const result = await boundedJson(response);
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
