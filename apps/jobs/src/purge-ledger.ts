import {
  purgeIntentSchema,
  purgeBatchSchema,
  sealPurgeIntent,
  openPurgeIntent,
} from '@snapform/contracts/purge';
import type { PurgeIntent } from '@snapform/contracts/purge';

// This private bucket contains irreversible metadata only, never response content
// or authentication backups. An existing object's identity must match exactly.
export async function persistPurgeIntent(
  bucket: R2Bucket,
  secret: string,
  raw: PurgeIntent,
) {
  const intent = purgeIntentSchema.parse(raw);
  const objectKey = `intents/${intent.id}.enc`;
  const stored = await bucket.put(
    objectKey,
    await sealPurgeIntent(intent, secret),
    {
      onlyIf: new Headers({ 'If-None-Match': '*' }),
      httpMetadata: {
        contentType: 'application/octet-stream',
        cacheControl: 'no-store',
      },
    },
  );
  if (stored) return;
  const existing = await bucket.get(objectKey);
  if (!existing || existing.size > 4096) throw Error('PURGE_LEDGER_CONFLICT');
  const recovered = await openPurgeIntent(
    await existing.text(),
    secret,
    intent.id,
  );
  if (JSON.stringify(recovered) !== JSON.stringify(intent))
    throw Error('PURGE_LEDGER_CONFLICT');
}
export async function runPurgeBatch(operations: {
  claim: () => Promise<unknown>;
  persist: (intent: PurgeIntent) => Promise<void>;
  finalize: (intent: PurgeIntent) => Promise<boolean>;
}) {
  const intents = purgeBatchSchema.parse(await operations.claim());
  let completed = 0,
    failed = 0;
  for (const intent of intents) {
    try {
      await operations.persist(intent);
      if (await operations.finalize(intent)) completed++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { claimed: intents.length, completed, failed };
}
