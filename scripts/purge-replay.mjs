import {
  purgeIntentSchema,
  openPurgeIntent,
  validatePurgeLedgerSecret,
} from '../packages/contracts/src/purge.ts';

const maximum = 10000;
const objectName =
  /^intents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.enc$/;

// Authenticate the complete bounded union before mutating the restored copy.
// This function never opens a database, grants privileges or reopens traffic.
export async function replayPurgeIntents({
  pending,
  objects,
  secret,
  persist,
  apply,
  now = Date.now(),
}) {
  let stage = 'validation';
  try {
    await validatePurgeLedgerSecret(secret);
    if (
      !Number.isFinite(now) ||
      !Array.isArray(pending) ||
      pending.length > maximum
    )
      throw Error();
    const byId = new Map(),
      byTarget = new Map(),
      objectKeys = new Set();
    function include(raw) {
      const item = purgeIntentSchema.parse(raw);
      if (Date.parse(item.createdAt) > now + 300000) throw Error();
      const identity = `${item.kind}:${item.targetId}`;
      if (
        (byId.has(item.id) &&
          JSON.stringify(byId.get(item.id)) !== JSON.stringify(item)) ||
        (byTarget.has(identity) && byTarget.get(identity) !== item.id)
      )
        throw Error();
      byId.set(item.id, item);
      byTarget.set(identity, item.id);
      if (byId.size > maximum) throw Error();
    }
    for (const item of pending) include(item);
    stage = 'ledger-authentication';
    let authenticatedObjects = 0;
    for await (const object of objects) {
      const match =
        typeof object?.key === 'string' && objectName.exec(object.key);
      if (
        !match ||
        typeof object.body !== 'string' ||
        object.body.length > 4096 ||
        objectKeys.has(object.key) ||
        ++authenticatedObjects > maximum
      )
        throw Error();
      objectKeys.add(object.key);
      include(await openPurgeIntent(object.body, secret, match[1]));
    }
    const intents = [...byId.values()].sort(
      (a, b) =>
        Number(a.kind !== 'workspace') - Number(b.kind !== 'workspace') ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
    for (const intent of intents) {
      stage = 'ledger-acknowledgement';
      if ((await persist(intent)) !== true) throw Error();
      stage = 'sql-replay';
      if ((await apply(intent)) !== true) throw Error();
    }
    return {
      replayed: intents.length,
      pendingSql: pending.length,
      authenticatedObjects,
      trafficSafe: false,
    };
  } catch {
    throw Object.assign(Error('PURGE_REPLAY_FAILED'), { stage });
  }
}
