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
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null);
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
  // Session credentials stay in the server's HttpOnly cookie, never client state.
  await response.body?.cancel();
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
    if (
      typeof result === 'object' &&
      result !== null &&
      'user' in result &&
      typeof result.user === 'object' &&
      result.user !== null
    ) {
      const user = result.user;
      if (
        'id' in user &&
        typeof user.id === 'string' &&
        'name' in user &&
        typeof user.name === 'string' &&
        'email' in user &&
        typeof user.email === 'string'
      )
        return { id: user.id, name: user.name, email: user.email };
    }
  }
  throw new Error('We couldn’t load your account.');
}
