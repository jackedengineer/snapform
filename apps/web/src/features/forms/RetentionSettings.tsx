import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RetentionSettings as Settings } from '@snapform/contracts/retention';
import { fetchRetention, commitRetention, retentionKey } from './retention-api';

export function RetentionSettings({
  workspaceId,
  userId,
  blocked = false,
}: {
  workspaceId: string;
  userId: string;
  blocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const refresh = useRef<HTMLButtonElement>(null),
    busy = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const cache = useQueryClient();
  const key = retentionKey(userId, workspaceId);
  const query = useQuery({
    queryKey: key,
    enabled: open,
    queryFn: ({ signal }) => fetchRetention(workspaceId, signal),
    gcTime: 0,
    retry: false,
  });
  const change = useMutation({
    mutationFn: (input: unknown) =>
      commitRetention(cache, userId, workspaceId, input, active),
    gcTime: 0,
    retry: false,
    onSettled: () => {
      busy.current = false;
      if (active.current) refresh.current?.focus();
    },
  });
  return (
    <details
      className="retention-settings"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        Response retention{' '}
        {query.data && (
          <span className="delivery-setting">{query.data.days} days</span>
        )}
      </summary>
      {open && (
        <div
          className="retention-content"
          aria-busy={query.isFetching || change.isPending}
        >
          <p>
            Choose how long this workspace keeps submitted responses. Unfinished
            conversations expire after seven days.
          </p>
          <p className="retention-warning">
            Shortening this period also applies to existing responses. Expired
            content is permanently deleted; exports you download remain your
            responsibility.
          </p>
          {query.isPending ? (
            <p role="status">Loading retention settings…</p>
          ) : query.isError ? (
            <p role="alert">{query.error.message}</p>
          ) : (
            <RetentionForm
              key={query.data.revision}
              settings={query.data}
              pending={change.isPending}
              blocked={blocked}
              onSave={(input) => {
                if (busy.current) return;
                busy.current = true;
                change.mutate(input);
              }}
            />
          )}
          {change.isError && (
            <p role="alert">
              {change.error.message} Refresh the saved policy before trying
              again.
            </p>
          )}
          {change.isSuccess && (
            <p role="status">
              Retention policy saved. {change.data.days} days.
            </p>
          )}
          <button
            ref={refresh}
            className="text-button"
            aria-disabled={query.isFetching || change.isPending}
            onClick={() => {
              if (query.isFetching || change.isPending) return;
              change.reset();
              void query.refetch();
            }}
          >
            {query.isFetching
              ? 'Refreshing…'
              : 'Refresh saved retention policy'}
          </button>
        </div>
      )}
    </details>
  );
}
function RetentionForm({
  settings,
  pending,
  onSave,
  blocked,
}: {
  settings: Settings;
  pending: boolean;
  onSave: (input: unknown) => void;
  blocked: boolean;
}) {
  const [days, setDays] = useState<number>(settings.days);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (
          pending ||
          blocked ||
          settings.role !== 'owner' ||
          days === settings.days
        )
          return;
        const data = new FormData(event.currentTarget);
        onSave({
          days,
          expectedRevision: settings.revision,
          acknowledgeDeletion: data.get('acknowledge') === 'yes',
        });
      }}
    >
      <fieldset disabled={settings.role !== 'owner' || pending || blocked}>
        <legend>Workspace retention policy</legend>
        <label htmlFor="retention-days">Keep submitted responses for</label>
        <select
          id="retention-days"
          name="days"
          value={days}
          onChange={(event) => setDays(Number(event.currentTarget.value))}
        >
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">365 days</option>
        </select>
        <label className="retention-acknowledgement">
          <input type="checkbox" name="acknowledge" value="yes" required />I
          understand that responses older than this period will be permanently
          deleted.
        </label>
        <button
          className="button primary compact-button"
          type="submit"
          disabled={days === settings.days}
        >
          {pending ? 'Saving…' : 'Save retention policy'}
        </button>
      </fieldset>
      {settings.role !== 'owner' && (
        <p>Only the workspace owner can change this policy.</p>
      )}
      {blocked && (
        <p>
          Policy changes are unavailable while workspace deletion is pending or
          its status cannot be confirmed. Use the workspace data controls below.
        </p>
      )}
      <p className="retention-note">
        Saved policy: {settings.days} days. Deletions run in scheduled batches.
        Encrypted backups expire within 30 days; deleted content must be removed
        during recovery before access is restored.
      </p>
    </form>
  );
}
