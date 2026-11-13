import { useState, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { EmailOverview } from '@snapform/contracts/notifications';
import {
  fetchEmailOverview,
  saveEmailSettings,
  retryEmailDelivery,
} from './api';
const labels: Record<EmailOverview['deliveries'][number]['status'], string> = {
  pending: 'Waiting to send',
  sending: 'Sending',
  accepted: 'Accepted by email provider',
  delivered: 'Delivered to mail server',
  bounced: 'Bounced',
  complained: 'Marked as spam',
  failed: 'Delivery failed',
  suppressed: 'Sending suppressed',
  cancelled: 'Further attempts stopped',
  needs_action: 'Needs attention',
};
const reasons: Record<string, string> = {
  'recipient-unavailable': 'Verify the workspace owner first.',
  configuration: 'Contact support to set up email.',
  'provider-rejected': 'Rejected. Contact support.',
  'idempotency-expired': 'Unconfirmed. Ask support before retrying.',
  'attempts-exhausted': 'Retries stopped. Contact support.',
  disabled: 'A request already in progress may still arrive.',
};
const dates = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
export function EmailNotifications({
  workspaceId,
  formId,
  userId,
  canManage,
}: {
  workspaceId: string;
  formId: string;
  userId: string;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const overview = useQuery({
    queryKey: ['email-notifications', userId, workspaceId, formId],
    enabled: open,
    queryFn: ({ signal }) => fetchEmailOverview(workspaceId, formId, signal),
  });
  const change = useMutation({
    mutationFn: saveEmailSettings.bind(null, workspaceId, formId),
    retry: false,
    onSettled: () => overview.refetch(),
  });
  const retry = useMutation({
    mutationFn: retryEmailDelivery.bind(null, workspaceId, formId),
    retry: false,
    onSettled: async () => {
      await overview.refetch();
      refreshButton.current?.focus();
    },
  });
  const busy = overview.isFetching || change.isPending || retry.isPending;
  return (
    <details
      className="email-notifications"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        Email notifications{' '}
        {overview.data && (
          <span className="delivery-setting">
            {overview.data.settings.enabled ? 'On' : 'Off'}
          </span>
        )}
      </summary>
      {open && (
        <div className="notification-content" aria-busy={busy}>
          <p>
            Email the verified workspace owner a reference and private link for
            each new response.
          </p>
          <p className="notification-note">
            Future submissions only. Turning this off stops retries; an email in
            progress may still arrive.
          </p>
          {overview.isPending ? (
            <p role="status">Loading notification settings…</p>
          ) : overview.isError ? (
            <p role="alert">{overview.error.message}</p>
          ) : (
            <>
              <div className="notification-actions">
                <button
                  className="button primary compact-button"
                  disabled={!canManage}
                  aria-disabled={busy}
                  onClick={() => {
                    if (!busy)
                      change.mutate({
                        enabled: !overview.data.settings.enabled,
                        expectedRevision: overview.data.settings.revision,
                      });
                  }}
                >
                  {change.isPending
                    ? 'Saving…'
                    : overview.data.settings.enabled
                      ? 'Turn off email notifications'
                      : 'Turn on email notifications'}
                </button>
                {!canManage && (
                  <p>
                    Only workspace owners and editors can change this setting.
                  </p>
                )}
              </div>
              {change.isError && (
                <p role="alert">
                  {change.error.message} The saved setting is shown above.
                </p>
              )}
              <h2>Recent delivery activity</h2>
              <p className="notification-note">
                Latest 20 notifications. Neither acceptance nor delivery
                confirms an email was read.
              </p>
              {overview.data.deliveries.length === 0 ? (
                <p>No notification activity yet.</p>
              ) : (
                <ul className="notification-list">
                  {overview.data.deliveries.map((delivery) => (
                    <li key={delivery.id}>
                      <Link
                        to="/workspaces/$workspaceId/responses/$formId"
                        params={{ workspaceId, formId }}
                        search={{ response: delivery.responseId }}
                      >
                        Response {delivery.responseId.slice(0, 8)}
                      </Link>
                      <span
                        className="delivery-status"
                        data-status={delivery.status}
                      >
                        {labels[delivery.status]}
                      </span>
                      <span className="notification-note">
                        {dates.format(new Date(delivery.createdAt))} ·{' '}
                        {delivery.attempts}{' '}
                        {delivery.attempts === 1 ? 'attempt' : 'attempts'}
                      </span>
                      {delivery.reason && <p>{reasons[delivery.reason]}</p>}
                      {canManage && delivery.retryable && (
                        <button
                          className="text-button"
                          aria-disabled={busy}
                          onClick={() => {
                            if (!busy)
                              retry.mutate({
                                deliveryId: delivery.id,
                                expectedAttempts: delivery.attempts,
                              });
                          }}
                          aria-label={`Retry email for response ${delivery.responseId.slice(0, 8)}`}
                        >
                          {retry.isPending &&
                          retry.variables.deliveryId === delivery.id
                            ? 'Queuing…'
                            : 'Retry email'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {retry.isError && <p role="alert">{retry.error.message}</p>}
              {retry.isSuccess && <p role="status">Retry queued.</p>}
            </>
          )}
          <button
            ref={refreshButton}
            className="text-button"
            aria-disabled={busy}
            onClick={() => {
              if (!busy) void overview.refetch();
            }}
          >
            {overview.isFetching ? 'Refreshing…' : 'Refresh delivery status'}
          </button>
        </div>
      )}
    </details>
  );
}
