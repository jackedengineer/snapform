import { z } from 'zod';
export const purgeIntentSchema = z.strictObject({
  id: z.uuid(),
  workspaceId: z.uuid(),
  kind: z.enum(['response', 'workspace']),
  targetId: z.uuid(),
  reason: z.enum(['expired', 'owner']),
  createdAt: z.iso.datetime(),
});
export type PurgeIntent = z.infer<typeof purgeIntentSchema>;
export const purgeBatchSchema = z.array(purgeIntentSchema).max(20);
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (value.length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw Error();
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (encode(bytes) !== value) throw Error();
  return bytes;
}
function key(secret: string) {
  const bytes = decode(secret);
  if (bytes.length !== 32) throw Error();
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
function context(id: string) {
  return encoder.encode(`snapform-purge-ledger-v1|${z.uuid().parse(id)}`);
}
export async function sealPurgeIntent(
  raw: unknown,
  secret: string,
): Promise<string> {
  try {
    const intent = purgeIntentSchema.parse(raw);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: context(intent.id) },
      await key(secret),
      encoder.encode(JSON.stringify(intent)),
    );
    return `v1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
  } catch {
    throw Error('INVALID_PURGE_LEDGER');
  }
}
export async function openPurgeIntent(
  value: string,
  secret: string,
  id: string,
): Promise<PurgeIntent> {
  try {
    if (value.length > 4096) throw Error();
    const parts = value.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') throw Error();
    const iv = decode(parts[1]);
    if (iv.length !== 12) throw Error();
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: context(id) },
      await key(secret),
      decode(parts[2]),
    );
    const intent = purgeIntentSchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)),
    );
    if (intent.id !== id) throw Error();
    return intent;
  } catch {
    throw Error('INVALID_PURGE_LEDGER');
  }
}
