import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import type { FormSnapshot, LocalDraft } from '@snapform/contracts/draft';
import type { FormDefinition } from '@snapform/contracts/form';
import { can } from '@snapform/contracts/workspace';
import { DraftAutosave, definitionKey } from './autosave';
import type { AutosaveState } from './autosave';
import { openDraftStorage } from './draft-storage';
import type { DraftStorage } from './draft-storage';
import { saveDraftRequest } from './api';
import { useSignOutGuard } from '../auth/AccountLayout';
import { draftSessionEnded } from './draft-session';
export function useDraftAutosave(
  initialSnapshot: FormSnapshot,
  userId: string,
) {
  const [snapshot] = useState(initialSnapshot);
  const queue = useRef<DraftAutosave | null>(null);
  const capture = useRef<(() => FormDefinition) | null>(null);
  const storage = useRef<DraftStorage | null>(null);
  useBlocker({
    shouldBlockFn: async () => {
      if (!queue.current || (await queue.current.canLeave(capture.current?.())))
        return false;
      return !window.confirm(
        'These changes could not be saved on this device. Leave anyway?',
      );
    },
    enableBeforeUnload: () =>
      !!queue.current &&
      (definitionKey(
        capture.current?.() || queue.current.state.record.definition,
      ) !== definitionKey(queue.current.state.record.definition) ||
        (queue.current.state.status !== 'saved' &&
          !queue.current.state.buffered)),
  });
  const signOutGuard = useSignOutGuard();
  useEffect(() => {
    if (!signOutGuard) return;
    const prepare = async () => {
      await queue.current?.canLeave(capture.current?.());
    };
    signOutGuard.current = prepare;
    return () => {
      if (signOutGuard.current === prepare) signOutGuard.current = null;
    };
  }, [signOutGuard]);
  const [state, setState] = useState<AutosaveState | null>(null);
  const [recoveries, setRecoveries] = useState<LocalDraft[]>([]);
  const [storageWarning, setStorageWarning] = useState('');
  useEffect(() => {
    let disposed = false;
    const scope = {
      userId,
      workspaceId: snapshot.workspaceId,
      formId: snapshot.id,
    };
    const stop = () => {
      disposed = true;
      queue.current?.close();
      storage.current?.close();
    };
    const reconnect = () => {
      void queue.current?.flush();
    };
    window.addEventListener(draftSessionEnded, stop);
    window.addEventListener('online', reconnect);
    const initialize = async () => {
      let backup: LocalDraft['backup'] = null;
      let local: DraftStorage | null = null;
      try {
        local = await openDraftStorage(scope);
        if (disposed) {
          local.close();
          return;
        }
        storage.current = local;
        const records = await local.list();
        if (disposed) {
          local.close();
          return;
        }
        backup = records.find((record) => record.backup)?.backup || null;
        const alternatives = [];
        for (const record of records) {
          if (
            !record.pending &&
            !record.backup &&
            definitionKey(record.definition) ===
              definitionKey(snapshot.definition)
          )
            await local.remove(record.editorId);
          else if (
            record.pending ||
            definitionKey(record.definition) !==
              definitionKey(snapshot.definition)
          )
            alternatives.push(record);
        }
        if (!disposed) setRecoveries(alternatives);
      } catch (error) {
        if (!disposed)
          setStorageWarning(
            error instanceof Error
              ? error.message
              : 'Local recovery is unavailable.',
          );
      }
      if (disposed) {
        local?.close();
        return;
      }
      const initial: LocalDraft = {
        version: 1,
        ...scope,
        editorId: crypto.randomUUID(),
        revision: snapshot.revision,
        definition: snapshot.definition,
        updatedAt: Date.now(),
        pending: null,
        backup,
      };
      const current: DraftAutosave = new DraftAutosave(initial, {
        persist: (record) => {
          if (!local)
            return Promise.reject(new Error('Local recovery is unavailable.'));
          return !record.pending &&
            !record.backup &&
            current.state.status === 'saved'
            ? local.remove(record.editorId)
            : local.put(record);
        },
        send: (input, signal) =>
          saveDraftRequest(snapshot.workspaceId, snapshot.id, input, signal),
        changed: (next) => {
          if (!disposed) setState(next);
        },
      });
      queue.current = current;
      setState({ ...current.state });
    };
    if (can(snapshot.role, 'forms.write')) void initialize();
    return () => {
      disposed = true;
      stop();
      queue.current = null;
      storage.current = null;
      window.removeEventListener(draftSessionEnded, stop);
      window.removeEventListener('online', reconnect);
    };
  }, [snapshot, userId]);
  const edit = useCallback(
    (definition: FormDefinition) => queue.current?.edit(definition),
    [],
  );
  const flush = useCallback(() => queue.current?.flush(), []);
  const accept = useCallback(
    (revision: number, definition: FormDefinition) =>
      queue.current?.accept(revision, definition),
    [],
  );
  const recover = useCallback(async (record: LocalDraft) => {
    if (
      await queue.current?.recover(record, queue.current.state.record.revision)
    ) {
      try {
        await storage.current?.remove(record.editorId);
        setRecoveries((items) =>
          items.filter((item) => item.editorId !== record.editorId),
        );
      } catch (error) {
        setStorageWarning(
          error instanceof Error
            ? error.message
            : 'Couldn’t update local recovery.',
        );
      }
    }
  }, []);
  return {
    state,
    recoveries,
    storageWarning,
    edit,
    flush,
    accept,
    recover,
    capture,
  };
}
