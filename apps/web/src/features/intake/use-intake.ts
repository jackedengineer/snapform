import { reconcileRecovery } from './reconcile';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PublicForm } from '@snapform/contracts/public-form';
import type { IntakeRecovery } from '@snapform/contracts/intake-progress';
import { getRecovery, putRecovery, removeRecovery } from './storage';
import { withTabLock } from './tab-lock';
import type { TabAccess } from './tab-lock';
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
    [business, setBusiness] = useState<PublicForm['business']>(),
    [siteKey, setSiteKey] = useState(''),
    [progress, setProgress] = useState<ProgressState | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [storageError, setStorageError] = useState(false),
    [unavailable, setUnavailable] = useState<'missing' | 'closed' | null>(null),
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
      // Without the tab lock this frame has no browser storage either (such as
      // a third-party embed with storage blocked), so answers stay in memory.
      recoverable = true,
      release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    setLoading(true);
    setError('');
    setUnavailable(null);
    setProgress(null);
    setForm(null);
    setBusiness(undefined);
    function attach(
      record: IntakeRecovery,
      acknowledged: NonNullable<IntakeRecovery['session']>['answers'],
    ) {
      const next = new IntakeProgress(record, acknowledged, {
        persist: (state) =>
          recoverable
            ? putRecovery(state)
            : Promise.reject(Error('Browser recovery is unavailable.')),
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
    async function run(access: TabAccess) {
      if (!active) return;
      if (access === 'busy') {
        setError(
          'This form is already open in another tab. Close that tab, then retry here.',
        );
        setLoading(false);
        return;
      }
      recoverable = access === 'held';
      if (!recoverable) setStorageError(true);
      actions.current.forget = async () => {
        setBusy(true);
        try {
          await controller.current?.close();
          controller.current = null;
          if (recoverable) await removeRecovery(publicId);
          replaceSaved.current = false;
          if (active) setReload((value) => value + 1);
        } catch {
          if (active)
            setError(
              'Saved answers couldn’t be cleared from this browser. Try again.',
            );
        } finally {
          if (active) setBusy(false);
        }
      };
      let record = newRecovery(publicId),
        stored = false;
      try {
        if (recoverable)
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
            // The session alone decides whether to resume. The business name
            // only labels the form; without it the generic wording stays.
            const [session, named] = await Promise.all([
              readIntakeRequest(publicId, record.identity),
              readPublicForm(publicId).then(
                (published) => published.business,
                () => undefined,
              ),
            ]);
            if (!active) return;
            setBusiness(named);
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
          setBusiness(published.business);
          setSiteKey(configuration.siteKey);
        }
        actions.current.start = async (token) => {
          if (!active || controller.current) return;
          setBusy(true);
          setError('');
          try {
            if (recoverable)
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
            if (recoverable)
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
            if (
              active &&
              failure instanceof IntakeRequestError &&
              ['closed', 'quota'].includes(failure.code)
            )
              setUnavailable('closed');
            else if (active) {
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
        if (
          active &&
          !record.session &&
          failure instanceof IntakeRequestError &&
          (failure.code === 'missing' || failure.code === 'closed')
        )
          setUnavailable(failure.code);
        else if (active) {
          const message =
            failure instanceof IntakeRequestError
              ? failure.message
              : 'We couldn’t load this form. Your browser copy has not been cleared.';
          setError(message);
          if (record.session) {
            const retained = attach(record, record.session.answers);
            retained.state.status = 'blocked';
            retained.state.message =
              'Your answers in this browser are shown below. Reload to try again, or clear saved answers to start over.';
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
        withTabLock(navigator.locks, 'snapform-intake:' + publicId, run).catch(
          () => {
            if (active) {
              setError(
                'This browser couldn’t open the saved form. Retry to continue.',
              );
              setLoading(false);
            }
          },
        ),
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
    business,
    siteKey,
    progress,
    controller: controller.current,
    loading,
    error,
    storageError,
    unavailable,
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
