import { reconcileRecovery } from './reconcile';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PublicForm } from '@snapform/contracts/public-form';
import type { IntakeRecovery } from '@snapform/contracts/intake-progress';
import { getRecovery, putRecovery, removeRecovery } from './storage';
import { newRecovery } from './recovery';
import { IntakeProgress } from './progress';
import type { ProgressState } from './progress';
import {
  readPublicForm,
  readIntakeConfiguration,
  readIntakeRequest,
  startIntakeRequest,
  writeIntakeRequest,
  IntakeRequestError,
} from './api';
export function useIntake(publicId: string) {
  const query = useQueryClient();
  const [form, setForm] = useState<PublicForm | null>(null),
    [siteKey, setSiteKey] = useState(''),
    [progress, setProgress] = useState<ProgressState | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [storageError, setStorageError] = useState(false),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    [reload, setReload] = useState(0);
  const controller = useRef<IntakeProgress | null>(null);
  const lifecycle = useRef<Promise<unknown>>(Promise.resolve());
  const replaceSaved = useRef(false);
  const actions = useRef<{
    start: ((token: string) => Promise<void>) | null;
    forget: (() => Promise<void>) | null;
  }>({ start: null, forget: null });
  useEffect(() => {
    let ownedController: IntakeProgress | null = null;
    let active = true,
      release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    setLoading(true);
    setError('');
    setProgress(null);
    setForm(null);
    function attach(
      record: IntakeRecovery,
      acknowledged: NonNullable<IntakeRecovery['session']>['answers'],
    ) {
      const next = new IntakeProgress(record, acknowledged, {
        persist: putRecovery,
        send: (input, kind) =>
          writeIntakeRequest(publicId, record.identity, input, kind),
        changed: (state) => {
          if (active) setProgress(state);
        },
      });
      ownedController = next;
      controller.current = next;
      setProgress({ ...next.state });
      return next;
    }
    async function run(lock: Lock | null) {
      if (!active) return;
      if (!lock) {
        setError(
          'This form is already open in another tab. Close that tab, then retry here.',
        );
        setLoading(false);
        return;
      }
      actions.current.forget = async () => {
        setBusy(true);
        try {
          await controller.current?.close();
          controller.current = null;
          await removeRecovery(publicId);
          replaceSaved.current = false;
          if (active) setReload((value) => value + 1);
        } catch {
          if (active)
            setError(
              'The browser copy could not be removed. Keep this tab open and try again.',
            );
        } finally {
          if (active) setBusy(false);
        }
      };
      let record = newRecovery(publicId),
        stored = false;
      try {
        try {
          const recovered = await getRecovery(publicId);
          stored = Boolean(recovered);
          record = recovered || record;
        } catch {
          if (active) setStorageError(true);
        }
        if (!active) return;
        let resumed = false;
        if (stored)
          try {
            const session = await readIntakeRequest(publicId, record.identity);
            if (!active) return;
            const recovery = reconcileRecovery(
              record,
              session,
              replaceSaved.current,
            );
            if (replaceSaved.current) {
              try {
                await putRecovery(recovery.record);
              } catch {
                setStorageError(true);
              }
              replaceSaved.current = false;
            }
            const next = attach(recovery.record, session.answers);
            if (recovery.conflict) {
              next.state.status = 'conflict';
              next.state.message =
                'The saved response has newer changes. Your unsent answers remain here.';
              setProgress({ ...next.state });
            } else void next.flush();
            setForm({
              publicId,
              versionId: session.versionId,
              definition: session.definition,
            });
            resumed = true;
          } catch (failure) {
            if (
              record.session ||
              !(failure instanceof IntakeRequestError) ||
              failure.code !== 'expired'
            )
              throw failure;
          }
        if (!resumed) {
          const [published, configuration] = await Promise.all([
            query.fetchQuery({
              queryKey: ['public-form', publicId],
              queryFn: () => readPublicForm(publicId),
            }),
            query.fetchQuery({
              queryKey: ['intake-config'],
              queryFn: readIntakeConfiguration,
            }),
          ]);
          if (!active) return;
          setForm(published);
          setSiteKey(configuration.siteKey);
        }
        actions.current.start = async (token) => {
          if (!active || controller.current) return;
          setBusy(true);
          setError('');
          try {
            try {
              await putRecovery(record);
            } catch {
              if (active) setStorageError(true);
            }
            const session = await startIntakeRequest(
              publicId,
              record.identity,
              token,
            );
            if (!active) return;
            record = {
              ...record,
              session,
              pending: null,
              expiresAt: Date.parse(session.expiresAt),
            };
            try {
              await putRecovery(record);
            } catch {
              setStorageError(true);
            }
            attach(record, session.answers);
            setForm({
              publicId,
              versionId: session.versionId,
              definition: session.definition,
            });
          } catch (failure) {
            if (active) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'The form couldn’t start. Try again.',
              );
              setAttempt((value) => value + 1);
            }
          } finally {
            if (active) setBusy(false);
          }
        };
      } catch (failure) {
        if (active) {
          const message =
            failure instanceof IntakeRequestError
              ? failure.message
              : 'We couldn’t load this form. Your browser copy has not been cleared.';
          setError(message);
          if (record.session) {
            const retained = attach(record, record.session.answers);
            retained.state.status = 'blocked';
            retained.state.message =
              'Your browser copy is shown below. Reload to retry, or forget this copy to start again.';
            setProgress({ ...retained.state });
            setForm({
              publicId,
              versionId: record.session.versionId,
              definition: record.session.definition,
            });
          }
        }
      } finally {
        if (active) setLoading(false);
      }
      await held;
      await ownedController?.close();
      if (controller.current === ownedController) controller.current = null;
    }
    if (!navigator.locks) {
      setError(
        'Use a current browser to securely recover this form across tabs.',
      );
      setLoading(false);
    } else
      lifecycle.current = lifecycle.current.then(() =>
        navigator.locks
          .request('snapform-intake:' + publicId, { ifAvailable: true }, run)
          .catch(() => {
            if (active) {
              setError(
                'This browser couldn’t open the saved form. Retry to continue.',
              );
              setLoading(false);
            }
          }),
      );
    return () => {
      active = false;
      release();
    };
  }, [publicId, query, reload]);
  useEffect(() => {
    const flush = () => void controller.current?.flush();
    const leave = (event: BeforeUnloadEvent) => {
      if (
        controller.current &&
        !['saved', 'submitted'].includes(controller.current.state.status)
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('online', flush);
    window.addEventListener('beforeunload', leave);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('beforeunload', leave);
    };
  }, []);
  return {
    form,
    siteKey,
    progress,
    controller: controller.current,
    loading,
    error,
    storageError,
    busy,
    attempt,
    start: (token: string) => actions.current.start?.(token),
    forget: () => actions.current.forget?.(),
    retry: () => setReload((value) => value + 1),
    useSaved: () => {
      replaceSaved.current = true;
      setReload((value) => value + 1);
    },
  };
}
