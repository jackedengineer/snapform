const testSecrets = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);
type Settings = { secret: string; origin: string; mode: string; token: string };
export async function verifyIntakeChallenge(
  settings: Settings,
  transport: typeof fetch = fetch,
): Promise<'verified' | 'rejected' | 'unavailable'> {
  let origin: URL;
  try {
    origin = new URL(settings.origin);
  } catch {
    return 'unavailable';
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  const testing = testSecrets.has(settings.secret);
  if (
    !settings.secret ||
    (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))
  )
    return 'unavailable';
  if (testing && (settings.mode !== 'local' || !local)) return 'unavailable';
  if (!settings.token || settings.token.length > 2048) return 'rejected';
  if (testing && settings.token !== 'XXXX.DUMMY.TOKEN.XXXX') return 'rejected';
  try {
    const response = await transport(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          secret: settings.secret,
          response: settings.token,
        }),
      },
    );
    if (!response.ok) return 'unavailable';
    const result: unknown = await response.json();
    if (
      typeof result !== 'object' ||
      result === null ||
      !('success' in result) ||
      typeof result.success !== 'boolean'
    )
      return 'unavailable';
    if (!result.success) return 'rejected';
    const hostname = 'hostname' in result ? result.hostname : undefined;
    const action = 'action' in result ? result.action : undefined;
    // Official dummy responses omit action and use example.com; never accept them off localhost.
    if (testing)
      return typeof hostname === 'string' &&
        [origin.hostname, 'localhost', 'example.com'].includes(hostname) &&
        (action === undefined || action === 'test' || action === 'intake_start')
        ? 'verified'
        : 'rejected';
    return hostname === origin.hostname && action === 'intake_start'
      ? 'verified'
      : 'rejected';
  } catch {
    return 'unavailable';
  }
}
