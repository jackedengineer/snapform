async function hash(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export async function intakeAuthorizationHash(
  authorization: string | undefined,
) {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i);
  return match ? hash(match[1]) : null;
}
