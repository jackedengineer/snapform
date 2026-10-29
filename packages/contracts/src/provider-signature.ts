type SignatureHeaders = { id: string; timestamp: string; signature: string };
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw Error('Invalid signing material');
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
export async function verifyProviderSignature(
  body: string,
  headers: SignatureHeaders,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (
    !headers.id ||
    headers.id.length > 128 ||
    !/^[1-9]\d{0,11}$/.test(headers.timestamp) ||
    !headers.signature ||
    headers.signature.length > 1024 ||
    !secret.startsWith('whsec_') ||
    new TextEncoder().encode(body).byteLength > 32768
  )
    return false;
  if (Math.abs(Number(headers.timestamp) - Math.floor(now / 1000)) > 300)
    return false;
  const signatures = headers.signature.trim().split(/\s+/);
  if (signatures.length > 8) return false;
  try {
    const bytes = decode(secret.slice(6));
    if (bytes.byteLength < 16 || bytes.byteLength > 64) return false;
    const key = await crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signed = new TextEncoder().encode(
      `${headers.id}.${headers.timestamp}.${body}`,
    );
    for (const signature of signatures) {
      if (!signature.startsWith('v1,')) continue;
      let value: Uint8Array<ArrayBuffer>;
      try {
        value = decode(signature.slice(3));
      } catch {
        continue;
      }
      if (
        value.byteLength === 32 &&
        (await crypto.subtle.verify('HMAC', key, value, signed))
      )
        return true;
    }
  } catch {
    // Malformed material or a crypto failure never authorizes a receipt.
    return false;
  }
  return false;
}
