import { responseEventMessageSchema } from './response-event.ts';
import { parseWebhookTarget } from './webhook-target.ts';
const identity = responseEventMessageSchema.shape.eventId;
const encoder = new TextEncoder();
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function decode(value: string, length?: number): Uint8Array<ArrayBuffer> {
  if (value.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw Error('INVALID_ENCODING');
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (
    base64(bytes) !== value ||
    (length !== undefined && bytes.length !== length)
  )
    throw Error('INVALID_ENCODING');
  return bytes;
}
function signingKey(secret: string) {
  if (secret.length !== 50 || !secret.startsWith('whsec_'))
    throw Error('INVALID_KEY');
  return crypto.subtle.importKey(
    'raw',
    decode(secret.slice(6), 32),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export function createWebhookSecret() {
  return 'whsec_' + base64(crypto.getRandomValues(new Uint8Array(32)));
}
export type WebhookSignature = {
  id: string;
  timestamp: string;
  signature: string;
};
export async function signWebhook(
  id: string,
  body: string,
  secret: string,
  now = Date.now(),
): Promise<WebhookSignature> {
  try {
    if (
      !identity.safeParse(id).success ||
      !Number.isFinite(now) ||
      now <= 0 ||
      encoder.encode(body).byteLength > 262144
    )
      throw Error();
    const timestamp = String(Math.floor(now / 1000));
    if (!/^[1-9]\d{0,11}$/.test(timestamp)) throw Error();
    const signed = await crypto.subtle.sign(
      'HMAC',
      await signingKey(secret),
      encoder.encode(`${id}.${timestamp}.${body}`),
    );
    return { id, timestamp, signature: 'v1,' + base64(new Uint8Array(signed)) };
  } catch {
    throw Error('INVALID_WEBHOOK_SIGNING');
  }
}
export async function verifyWebhook(
  body: string,
  headers: WebhookSignature,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  try {
    if (
      !identity.safeParse(headers.id).success ||
      !/^[1-9]\d{0,11}$/.test(headers.timestamp) ||
      !Number.isFinite(now) ||
      Math.abs(Number(headers.timestamp) - Math.floor(now / 1000)) > 300 ||
      headers.signature.length > 1024 ||
      encoder.encode(body).byteLength > 262144
    )
      return false;
    const candidates = headers.signature.split(' ');
    if (candidates.length > 8) return false;
    const key = await signingKey(secret);
    const message = encoder.encode(
      `${headers.id}.${headers.timestamp}.${body}`,
    );
    // Exactly 32 canonical base64 bytes; malformed rotations do not hide a valid key.
    for (const candidate of candidates) {
      if (!/^v1,[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(candidate))
        continue;
      if (
        await crypto.subtle.verify(
          'HMAC',
          key,
          decode(candidate.slice(3), 32),
          message,
        )
      )
        return true;
    }
    return false;
  } catch {
    return false;
  }
}
export type WebhookContext = {
  workspaceId: string;
  formId: string;
  configurationId: string;
};
export type WebhookDestination = { url: string; secret: string };
function additionalData(context: WebhookContext) {
  if (
    ![context.workspaceId, context.formId, context.configurationId].every(
      (id) => identity.safeParse(id).success,
    )
  )
    throw Error('INVALID_CONTEXT');
  return encoder.encode(
    `snapform-webhook-v1|${context.workspaceId.toLowerCase()}|${context.formId.toLowerCase()}|${context.configurationId.toLowerCase()}`,
  );
}
async function encryptionKey(master: string) {
  return crypto.subtle.importKey('raw', decode(master, 32), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
function destination(value: unknown): WebhookDestination {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('url' in value) ||
    typeof value.url !== 'string' ||
    !('secret' in value) ||
    typeof value.secret !== 'string' ||
    Object.keys(value).length !== 2
  )
    throw Error();
  if (value.secret.length !== 50 || !value.secret.startsWith('whsec_'))
    throw Error();
  decode(value.secret.slice(6), 32);
  return { url: parseWebhookTarget(value.url), secret: value.secret };
}
export async function sealWebhookDestination(
  value: WebhookDestination,
  master: string,
  context: WebhookContext,
): Promise<string> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(context) },
      await encryptionKey(master),
      encoder.encode(JSON.stringify(destination(value))),
    );
    return `v1.${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
  } catch {
    throw Error('INVALID_WEBHOOK_DESTINATION');
  }
}
export async function openWebhookDestination(
  sealed: string,
  master: string,
  context: WebhookContext,
): Promise<WebhookDestination> {
  try {
    if (sealed.length > 8192) throw Error();
    const [version, iv, body, ...extra] = sealed.split('.');
    if (version !== 'v1' || !iv || !body || extra.length) throw Error();
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decode(iv, 12),
        additionalData: additionalData(context),
      },
      await encryptionKey(master),
      decode(body),
    );
    return destination(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)),
    );
  } catch {
    throw Error('WEBHOOK_DESTINATION_UNAVAILABLE');
  }
}
