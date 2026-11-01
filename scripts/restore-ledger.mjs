import { applyCurrentMigrations } from './restore-migrations.mjs';
import { replayPurgeIntents } from './purge-replay.mjs';
import {
  readRestoredPendingIntents,
  applyRestoredPurgeIntent,
  quarantineRestoredCopy,
} from './restore-safety.mjs';

// A read-only drill must refuse SQL-only intents without an authenticated remote
// counterpart. It cannot repair missing durable records or authorize traffic.
export async function verifyRestoredLedger({ executeSql, objects, secret }) {
  const migrations = await applyCurrentMigrations(executeSql);
  const pending = await readRestoredPendingIntents(executeSql);
  const retained = new Set();
  async function* retainedObjects() {
    for await (const object of objects) {
      retained.add(object.key);
      yield object;
    }
  }
  const replay = await replayPurgeIntents({
    pending,
    objects: retainedObjects(),
    secret,
    persist: async (item) => retained.has(`intents/${item.id}.enc`),
    apply: (item) => applyRestoredPurgeIntent(executeSql, item),
  });
  await quarantineRestoredCopy(executeSql);
  return {
    ...migrations,
    ...replay,
    purgeReplay: 'authenticated',
    quarantined: true,
    trafficSafe: false,
  };
}
