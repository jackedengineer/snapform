import {
  purgeIntentSchema,
  purgeBatchSchema,
  sealPurgeIntent,
  openPurgeIntent,
  validatePurgeLedgerSecret,
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
// Only workspace/ or workspace/form/session/ (migration 0046 keys). An empty
// or partial prefix would list other tenants' objects, so it is refused.
const uploadPrefix =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:[0-9a-f-]{36}\/[0-9a-f-]{36}\/)?$/;
/**
 * Deletes a bounded number of pages of respondent files under a purge prefix.
 * Returns true once nothing remains; false leaves the rest for the next run.
 */
export async function deleteUploads(
  bucket: R2Bucket,
  prefix: string | null,
  { rounds = 10, page = 1000 } = {},
) {
  if (prefix === null) return true;
  if (!uploadPrefix.test(prefix)) throw Error('INVALID_UPLOAD_PREFIX');
  for (let round = 0; round < rounds; round++) {
    const listed = await bucket.list({ prefix, limit: page });
    if (listed.objects.length)
      await bucket.delete(listed.objects.map((object) => object.key));
    if (!listed.truncated) return true;
  }
  return false;
}
export async function runPurgeBatch(operations: {
  claim: () => Promise<unknown>;
  persist: (intent: PurgeIntent) => Promise<void>;
  /** Removes the target's files; false means some remain for a later run. */
  files?: (intent: PurgeIntent) => Promise<boolean>;
  finalize: (intent: PurgeIntent) => Promise<boolean>;
}) {
  const intents = purgeBatchSchema.parse(await operations.claim());
  let completed = 0,
    deferred = 0,
    failed = 0;
  for (const intent of intents) {
    try {
      await operations.persist(intent);
      // Rows are finalized only after their objects are gone.
      if (operations.files && !(await operations.files(intent))) deferred++;
      else if (await operations.finalize(intent)) completed++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { claimed: intents.length, completed, deferred, failed };
}
export async function runScheduledPurge(
  configuration: {
    enabled?: string;
    secret?: string;
    bucket?: R2Bucket;
    uploads?: R2Bucket;
  },
  operations: {
    owner: () => Promise<unknown>;
    expired: () => Promise<unknown>;
    prefix: (intent: PurgeIntent) => Promise<string | null>;
    finalize: (intent: PurgeIntent) => Promise<boolean>;
  },
) {
  const result = { claimed: 0, completed: 0, deferred: 0, failed: 0 };
  if (configuration.enabled !== '1') return result;
  const { bucket, uploads, secret = '' } = configuration;
  // Never finalize a database purge while its private files could remain.
  if (!bucket || !uploads) throw Error('PURGE_CONFIGURATION_REQUIRED');
  await validatePurgeLedgerSecret(secret);
  for (const claim of [operations.owner, operations.expired]) {
    const batch = await runPurgeBatch({
      claim,
      persist: (intent) => persistPurgeIntent(bucket, secret, intent),
      files: async (intent) =>
        deleteUploads(uploads, await operations.prefix(intent)),
      finalize: operations.finalize,
    });
    result.claimed += batch.claimed;
    result.completed += batch.completed;
    result.deferred += batch.deferred;
    result.failed += batch.failed;
  }
  return result;
}
