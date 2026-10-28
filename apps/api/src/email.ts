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
