import { intakeRecoverySchema } from '@snapform/contracts/intake-progress';
import type { IntakeRecovery } from '@snapform/contracts/intake-progress';
import { readRecovery } from './recovery';
const unavailable = () =>
  new Error(
    'Browser recovery is unavailable. Keep this tab open until your answers are saved.',
  );
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(unavailable());
      return;
    }
    const request = indexedDB.open('snapform-intake', 1);
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(unavailable());
    }, 10000);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('progress', { keyPath: 'publicId' });
    request.onerror = request.onblocked = () => {
      clearTimeout(timeout);
      settled = true;
      reject(unavailable());
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (settled) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function access<T>(
  run: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('progress', 'readwrite');
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(unavailable());
      run(tx.objectStore('progress'), (value) => {
        result = value;
      });
    });
  } finally {
    db.close();
  }
}
function scan(
  store: IDBObjectStore,
  done: (records: IntakeRecovery[]) => void,
) {
  const request = store.openCursor(),
    records: IntakeRecovery[] = [];
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      done(records);
      return;
    }
    const parsed = intakeRecoverySchema.safeParse(cursor.value);
    const record = parsed.success
      ? readRecovery(parsed.data, parsed.data.publicId, Date.now())
      : null;
    if (record) records.push(record);
    else cursor.delete();
    cursor.continue();
  };
}
export function getRecovery(publicId: string): Promise<IntakeRecovery | null> {
  return access((store, done) =>
    scan(store, (records) =>
      done(records.find((record) => record.publicId === publicId) || null),
    ),
  );
}
export async function putRecovery(input: IntakeRecovery) {
  const parsed = readRecovery(input, input.publicId, Date.now());
  if (!parsed) throw unavailable();
  // Keep only the capability/reference after finalization, not a browser answer archive.
  const record =
    parsed.session?.status === 'submitted'
      ? { ...parsed, session: null, pending: null }
      : parsed;
  await access<void>((store, done) => {
    const write = () => {
      store.put(record);
      done();
    };
    const existing = store.get(record.publicId);
    existing.onsuccess = () => {
      if (existing.result) {
        write();
        return;
      }
      const count = store.count();
      count.onsuccess = () => {
        if (count.result < 10) {
          write();
          return;
        }
        scan(store, (records) => {
          if (records.length >= 10) {
            store.transaction.abort();
            return;
          }
          write();
        });
      };
    };
  });
}
export function removeRecovery(publicId: string) {
  return access<void>((store, done) => {
    store.delete(publicId);
    done();
  });
}
