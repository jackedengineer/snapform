const genericFailure = 'We couldn’t complete that request. Please try again.';
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Check your email and password.',
  EMAIL_NOT_VERIFIED: 'Verify your email before signing in.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
  RECIPIENT_NOT_ALLOWED:
    'This preview can send email only to the approved test address.',
  INVALID_TOKEN:
    'This link has expired or was already used. Request a new one.',
  PASSWORD_TOO_SHORT: 'Use at least 12 characters.',
};
export async function authPost(path: string, body: unknown): Promise<void> {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  }).catch(() => {
    throw new Error(genericFailure);
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    let code = '';
    if (typeof result === 'object' && result !== null) {
      if ('code' in result && typeof result.code === 'string')
        code = result.code;
      else if (
        'error' in result &&
        typeof result.error === 'object' &&
        result.error !== null &&
        'code' in result.error &&
        typeof result.error.code === 'string'
      )
        code = result.error.code;
    }
    throw new Error(
      response.status === 429
        ? messages.RATE_LIMITED
        : messages[code] || genericFailure,
    );
  }
  const record =
    typeof result === 'object' && result !== null ? result : undefined;
  const valid =
    record &&
    (['sign-up/email', 'sign-in/email'].includes(path)
      ? 'user' in record && readUser(record.user) !== undefined
      : path === 'sign-out'
        ? 'success' in record && record.success === true
        : [
            'request-password-reset',
            'reset-password',
            'send-verification-email',
          ].includes(path) &&
          'status' in record &&
          record.status === true);
  if (!valid) throw new Error(genericFailure);
  // Validate the reply but never return session capabilities to application state.
}
export type User = { id: string; name: string; email: string };
export async function currentUser(): Promise<User | null> {
  const response = await fetch('/api/v1/me', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) return null;
  if (response.ok) {
    const result: unknown = await response.json();
    if (typeof result === 'object' && result !== null && 'user' in result) {
      const user = readUser(result.user);
      if (user) return user;
    }
  }
  throw new Error('We couldn’t load your account.');
}
function readUser(value: unknown): User | undefined {
  if (typeof value !== 'object' || value === null) return;
  if (
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'email' in value &&
    typeof value.email === 'string'
  )
    return { id: value.id, name: value.name, email: value.email };
}
