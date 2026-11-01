import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { canCancelDeletion } from '@snapform/contracts/deletion';
import type {
  DeletionRequest,
  DeletionTarget,
} from '@snapform/contracts/deletion';
import { fetchDeletion, scheduleDeletion, cancelDeletion } from './api';
import { DeletionForm } from './DeletionForm';
import { deletionKey, cacheConfirmedDeletion } from './deletion-cache';
import './deletion.css';
type Props = {
  userId: string;
  workspaceId: string;
  target: DeletionTarget;
  confirmation: string;
  role: string;
};
export function useDeletionStatus(
  userId: string,
  workspaceId: string,
  target: DeletionTarget,
  enabled = true,
) {
  return useQuery({
    queryKey: deletionKey(userId, workspaceId, target),
    queryFn: ({ signal }) => fetchDeletion(workspaceId, target, signal),
    enabled,
    retry: false,
    gcTime: 0,
    staleTime: 5000,
  });
}
const dates = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
export function DeletionControl(props: Props) {
  return props.role === 'owner' ? <ManagedDeletion {...props} /> : null;
}
function ManagedDeletion({ userId, workspaceId, target, confirmation }: Props) {
  const query = useDeletionStatus(userId, workspaceId, target),
    client = useQueryClient();
  const id = useId(),
    status = useRef<HTMLParagraphElement>(null),
    active = useRef(true);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const receipt = query.data;
  useEffect(() => {
    if (receipt?.state !== 'scheduled') return;
    const timer = setTimeout(
      () => {
        setNow(Date.now());
        void query.refetch();
      },
      Math.min(
        2147483647,
        Math.max(0, Date.parse(receipt.notBefore) - Date.now()) + 1,
      ),
    );
    return () => clearTimeout(timer);
  }, [receipt?.state, receipt?.notBefore, query.refetch]);
  async function confirmed(value: DeletionRequest) {
    if (
      await cacheConfirmedDeletion(
        client,
        deletionKey(userId, workspaceId, target),
        value,
        active,
      )
    )
      requestAnimationFrame(() => status.current?.focus());
  }
  const schedule = useMutation({
    mutationFn: (input: unknown) => scheduleDeletion(workspaceId, input),
    onSuccess: confirmed,
    onError: () => {
      if (active.current) void query.refetch();
    },
    gcTime: 0,
  });
  const cancel = useMutation({
    mutationFn: () => cancelDeletion(receipt),
    onSuccess: confirmed,
    onError: () => {
      if (active.current) void query.refetch();
    },
    gcTime: 0,
  });
  const pending =
    receipt?.state === 'scheduled' || receipt?.state === 'purging';
  return (
    <section className="deletion-control" aria-labelledby={id}>
      <h3 id={id}>
        {target.kind === 'response' ? 'Response data' : 'Workspace data'}
      </h3>
      {query.isPending ? (
        <p role="status">Checking deletion status…</p>
      ) : query.isError ? (
        <>
          <p role="alert" className="request-error">
            {query.error.message}
          </p>
          <button className="text-button" onClick={() => void query.refetch()}>
            Check status again
          </button>
        </>
      ) : (
        <>
          {receipt && (
            <p
              ref={status}
              tabIndex={-1}
              role="status"
              className="deletion-status"
            >
              {receipt.state === 'cancelled' ? (
                'Deletion cancelled. Your data is kept.'
              ) : receipt.state === 'deleted' ? (
                'Deletion completed. This data has been removed.'
              ) : (
                <>
                  {receipt.state === 'purging' ? (
                    'Deletion has started.'
                  ) : (
                    <>
                      Deletion starts after{' '}
                      <time dateTime={receipt.notBefore}>
                        {dates.format(new Date(receipt.notBefore))}
                      </time>
                      .
                    </>
                  )}{' '}
                  {canCancelDeletion(receipt, now)
                    ? 'You can cancel before that time.'
                    : 'The cancellation window has ended.'}
                </>
              )}
            </p>
          )}
          {pending && (
            <p>
              Collection, edits and delivery for this {target.kind} are stopped.
              Cancelling keeps the data; stopped notifications are not resent.
            </p>
          )}
          {receipt && (
            <p className="deletion-reference">
              Deletion reference <code>{receipt.id}</code>
            </p>
          )}
          {receipt && canCancelDeletion(receipt, now) && (
            <button
              className="button secondary compact-button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel deletion'}
            </button>
          )}
          {cancel.isError && (
            <p role="alert" className="request-error">
              {cancel.error.message}
            </p>
          )}
          {!pending && receipt?.state !== 'deleted' && (
            <details>
              <summary className="deletion-trigger">
                Delete {target.kind}…
              </summary>
              <DeletionForm
                key={receipt?.id || 'new'}
                target={target}
                confirmation={confirmation}
                pending={schedule.isPending || query.isFetching}
                error={schedule.error?.message}
                submit={(input) => schedule.mutateAsync(input)}
              />
            </details>
          )}
          <button
            className="text-button deletion-refresh"
            aria-disabled={
              query.isFetching || schedule.isPending || cancel.isPending
            }
            onClick={() => {
              if (!query.isFetching && !schedule.isPending && !cancel.isPending)
                void query.refetch();
            }}
          >
            Refresh deletion status
          </button>
        </>
      )}
    </section>
  );
}
