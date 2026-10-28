import type { LocalDraft } from '@snapform/contracts/draft';
import { localDraftSchema } from '@snapform/contracts/draft';
import { localDraftKey, readLocalDraft } from './local-draft';
import type { DraftScope } from './local-draft';
const storageError = () =>
  new Error(
    'Local recovery is unavailable. Keep this tab open until your changes are saved.',
  );
const sessionError = () =>
  new Error('Your session changed. Sign in again before editing.');
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(storageError());
      return;
    }
    const request = indexedDB.open('snapform-authoring', 1);
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(storageError());
    }, 10000);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('drafts', { keyPath: 'key' }).createIndex(
        'scope',
        'scope',
      );
      db.createObjectStore('meta');
    };
    request.onerror = request.onblocked = () => {
      clearTimeout(timeout);
      settled = true;
      reject(storageError());
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
function transaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['drafts', 'meta'], mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(storageError());
    run(tx, (value) => {
      result = value;
    });
  });
}
export type DraftStorage = Awaited<ReturnType<typeof openDraftStorage>>;
export async function openDraftStorage(scope: DraftScope) {
  const db = await openDatabase();
  const epoch = await transaction<unknown>(db, 'readonly', (tx, done) => {
    const request = tx.objectStore('meta').get('epoch');
    request.onsuccess = () => done(request.result);
  }).catch((error: unknown) => {
    db.close();
    throw error;
  });
  const scopeKey = JSON.stringify([
    scope.userId,
    scope.workspaceId,
    scope.formId,
  ]);
  let closed = false;
  function access<T>(
    mode: IDBTransactionMode,
    run: (tx: IDBTransaction, done: (value: T) => void) => void,
  ) {
    if (closed) return Promise.reject<T>(sessionError());
    let changed = false;
    return transaction<T>(db, mode, (tx, done) => {
      const request = tx.objectStore('meta').get('epoch');
      request.onsuccess = () => {
        if (request.result !== epoch) {
          changed = true;
          tx.abort();
          return;
        }
        run(tx, done);
      };
    }).catch((error: unknown) => {
      throw changed ? sessionError() : error;
    });
  }
  return {
    async list(): Promise<LocalDraft[]> {
      return access('readwrite', (tx, done) => {
        const request = tx
          .objectStore('drafts')
          .index('scope')
          .openCursor(scopeKey);
        const valid: LocalDraft[] = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            done(valid.sort((a, b) => b.updatedAt - a.updatedAt));
            return;
          }
          const record: unknown = cursor.value;
          const value =
            record && typeof record === 'object' && 'value' in record
              ? readLocalDraft(record.value, scope, Date.now())
              : null;
          if (value) valid.push(value);
          else cursor.delete();
          if (valid.length > 100) {
            tx.abort();
            return;
          }
          cursor.continue();
        };
      });
    },
    put(input: LocalDraft) {
      const parsed = localDraftSchema.parse(input);
      if (!readLocalDraft(parsed, scope, Date.now()))
        return Promise.reject(storageError());
      return access<void>('readwrite', (tx, done) => {
        tx.objectStore('drafts').put({
          key: localDraftKey(parsed),
          scope: scopeKey,
          value: parsed,
        });
        done();
      });
    },
    remove(editorId: string) {
      return access<void>('readwrite', (tx, done) => {
        tx.objectStore('drafts').delete(localDraftKey({ ...scope, editorId }));
        done();
      });
    },
    close() {
      closed = true;
      db.close();
    },
  };
}
// The epoch check shares the write transaction: an older tab cannot refill a cleared cache.
export async function clearDraftStorage() {
  const db = await openDatabase();
  try {
    await transaction<void>(db, 'readwrite', (tx, done) => {
      tx.objectStore('drafts').clear();
      tx.objectStore('meta').put(crypto.randomUUID(), 'epoch');
      done();
    });
  } finally {
    db.close();
  }
}
export async function hasDraftStorage() {
  const db = await openDatabase();
  try {
    return await transaction<boolean>(db, 'readonly', (tx, done) => {
      const request = tx.objectStore('drafts').count();
      request.onsuccess = () => done(request.result > 0);
    });
  } finally {
    db.close();
  }
}
