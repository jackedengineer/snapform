import { invitationTokenFromFragment } from '@snapform/contracts/team';
export type AuthMessage = { kind: 'verify' | 'reset'; to: string; url: string };

type MailSettings = {
  apiKey: string;
  from: string;
  origin: string;
  allowedRecipient?: string;
};

// Plain text avoids an HTML templating dependency and interpolation hazards.
export function makeAuthMailer(
  settings: MailSettings,
  transport: typeof fetch = fetch,
) {
  return async ({ kind, to, url }: AuthMessage) => {
    try {
      const action = new URL(url);
      if (
        !settings.apiKey ||
        !settings.from ||
        /[\r\n]/.test(to + settings.from) ||
        (settings.allowedRecipient &&
          to.toLowerCase() !== settings.allowedRecipient.toLowerCase()) ||
        action.origin !== settings.origin ||
        action.username ||
        action.password ||
        !(
          action.pathname === '/api/auth/verify-email' ||
          action.pathname.startsWith('/api/auth/reset-password/')
        )
      )
        throw new Error('Invalid email');
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(to + url),
      );
      const key = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      const reset = kind === 'reset';
      const response = await transport('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `auth-${kind}-${key}`,
        },
        body: JSON.stringify({
          from: settings.from,
          to: [to],
          subject: reset
            ? 'Reset your Snapform password'
            : 'Verify your Snapform email',
          text: `${reset ? 'Reset your password' : 'Verify your email address'} using this link:\n\n${url}\n\nThis link expires in 15 minutes. If you did not request it, you can ignore this email.\n\nSnapform`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Provider rejected email');
      const result: unknown = await response.json();
      if (
        typeof result !== 'object' ||
        result === null ||
        !('id' in result) ||
        typeof result.id !== 'string' ||
        !result.id
      )
        throw new Error('Invalid provider response');
    } catch {
      // Provider bodies and action URLs can contain secrets; never reflect them.
      throw new Error('Auth email could not be sent.');
    }
  };
}

export type InviteMessage = {
  id: string;
  to: string;
  inviter: string;
  workspace: string;
  role: 'editor' | 'viewer';
  url: string;
};
// C0/C1 controls, line/paragraph separators and bidirectional overrides.
const unsafe =
  /[\p{Cc}\u2028\u2029\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
// One header-safe line of at most 80 characters, cut on code points.
function line(value: string, fallback: string) {
  const characters = Array.from(
    value.toWellFormed().replace(unsafe, ' ').replace(/\s+/g, ' ').trim(),
  );
  const text =
    characters.length > 80
      ? `${characters.slice(0, 79).join('').trimEnd()}…`
      : characters.join('');
  return text || fallback;
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
const roleCopy = {
  editor:
    'As an editor, you can build and publish forms and read their responses.',
  viewer:
    'As a viewer, you can read forms and every response they collect, including any sensitive answers.',
};
const identity =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function renderInvite(message: InviteMessage) {
  const inviter = line(message.inviter, 'A teammate'),
    workspace = line(message.workspace, 'a workspace'),
    subject = `${inviter} invited you to ${workspace} on Snapform`,
    role = roleCopy[message.role],
    fine = `Sign in or create an account with ${message.to} to accept. The invite works once and expires in 7 days. If you weren’t expecting it, you can ignore this email.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title></head><body style="margin:0;padding:0;background:#F7F6F2;color:#191A1B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F2"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #DDDDD6;border-radius:20px"><tr><td style="padding:32px"><p style="margin:0 0 24px;font-weight:700;color:#3154F4">Snapform</p><h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#191A1B">Join ${escape(workspace)}</h1><p style="margin:0 0 16px">${escape(inviter)} invited you to join ${escape(workspace)} on Snapform.</p><p style="margin:0 0 24px">${escape(role)}</p><a href="${escape(message.url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#3154F4;color:#FFFFFF;font-weight:600;text-decoration:none">Accept invite</a><p style="margin:32px 0 0;font-size:14px;color:#56585C">${escape(fine)}</p></td></tr></table></td></tr></table></body></html>`;
  const text = `${inviter} invited you to join ${workspace} on Snapform.\n\n${role}\n\nAccept the invite:\n${message.url}\n\n${fine}\n\nSnapform`;
  return { subject, html, text };
}
// Locally only the allowed test address receives mail. The inviter still gets
// the link once, so a skipped send is reported rather than treated as failure.
export function makeInviteMailer(
  settings: MailSettings,
  transport: typeof fetch = fetch,
) {
  return async (message: InviteMessage): Promise<boolean> => {
    if (
      settings.allowedRecipient &&
      message.to.toLowerCase() !== settings.allowedRecipient.toLowerCase()
    )
      return false;
    try {
      const link = new URL(message.url);
      if (
        !settings.apiKey ||
        !settings.from ||
        /[\r\n]/.test(message.to + settings.from) ||
        !/^[^\s@]+@[^\s@]+$/.test(message.to) ||
        !identity.test(message.id) ||
        !Object.hasOwn(roleCopy, message.role) ||
        link.origin !== settings.origin ||
        link.username ||
        link.password ||
        link.pathname !== '/invite' ||
        link.search ||
        !invitationTokenFromFragment(link.hash)
      )
        throw new Error('Invalid email');
      const response = await transport('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `team-invite-v1-${message.id}`,
        },
        body: JSON.stringify({
          from: settings.from,
          to: [message.to],
          ...renderInvite(message),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Provider rejected email');
      const result: unknown = await response.json();
      if (
        typeof result !== 'object' ||
        result === null ||
        !('id' in result) ||
        typeof result.id !== 'string' ||
        !result.id
      )
        throw new Error('Invalid provider response');
      return true;
    } catch {
      // Invite links are capabilities; never reflect them or provider bodies.
      throw new Error('Invite email could not be sent.');
    }
  };
}
