// Better Auth's signed-cookie syntax: URL-encoded `${token}.${base64 HMAC}`.
// It is neither signed with the configured secret nor a stored session.
export const sessionToken = `${'a'.repeat(32)}.${encodeURIComponent('A'.repeat(43) + '=')}`;
export const sessionCookie = `snapform.session_token=${sessionToken}`;
