import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { canOfferWebhookRetry } from '@snapform/contracts/webhook-deliveries';
import type {
  WebhookPreview,
  WebhookHistory,
  WebhookSendInput,
  WebhookToggleInput,
} from '@snapform/contracts/webhook-deliveries';
import type { WebhookSettings } from '@snapform/contracts/webhook-settings';
import { fetchPublication, FormRequestError } from './api';
import {
  prepareWebhookPreview,
  sendWebhookDelivery,
  toggleWebhookDelivery,
  fetchWebhookHistory,
} from './webhook-api';

const dates = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const labels: Record<WebhookHistory['deliveries'][number]['status'], string> = {
  preview: 'Preview only',
  pending: 'Queued',
  sending: 'Sending',
  acknowledged: 'Acknowledged',
  unknown: 'Outcome unknown',
  needs_action: 'Needs attention',
  cancelled: 'Further attempts stopped',
};
const reasons: Record<string, string> = {
  disabled:
    'Delivery was turned off. A request already in progress may still arrive.',
  'configuration-changed':
    'The endpoint changed. This request will not be sent to its replacement.',
  'receiver-unconfirmed':
    'The receiver may already have processed this request.',
  'attempts-exhausted':
    'The eight-attempt limit was reached. Automatic retries have stopped.',
  configuration: 'Contact support to check the signing configuration.',
  'payload-invalid':
    'The stored response could not be prepared. Contact support.',
  'rate-limited': 'The receiver asked us to wait.',
  'receiver-unavailable': 'The receiver is temporarily unavailable.',
  'redirect-blocked':
    'Redirects are blocked. Fix the receiver at the saved URL.',
  authorization:
    'The receiver rejected authorization. Fix its signing-key setup before retrying.',
  'receiver-rejected':
    'The receiver rejected the request. Fix its handler before retrying.',
  'retry-later':
    'The receiver requested a pause longer than a day. Check it before retrying.',
};
type Props = {
  workspaceId: string;
  formId: string;
  userId: string;
  data: WebhookSettings;
  disabled: boolean;
  onStarted: () => void;
  onSettled: (error: Error | null, text?: string) => Promise<void>;
};
export function WebhookDeliveryPanel({
  workspaceId,
  formId,
  userId,
  data,
  disabled,
  onStarted,
  onSettled,
}: Props) {
  const [preview, setPreview] = useState<WebhookPreview | null>(null);
  const [acknowledgedRisk, setAcknowledgedRisk] = useState<string | null>(null);
  const previewId = useRef<string | null>(null);
  const publication = useQuery({
    queryKey: ['publication', userId, workspaceId, formId],
    queryFn: ({ signal }) => fetchPublication(workspaceId, formId, signal),
  });
  const history = useQuery({
    queryKey: ['webhook-history', userId, workspaceId, formId],
    queryFn: ({ signal }) => fetchWebhookHistory(workspaceId, formId, signal),
    refetchInterval: (query) =>
      query.state.data?.deliveries.some((row) =>
        ['pending', 'sending'].includes(row.status),
      )
        ? 5000
        : false,
  });
  useEffect(() => {
    if (
      !data.verifiedAt &&
      history.data?.deliveries.some(
        (row) =>
          row.kind === 'test' &&
          row.configurationId === data.configurationId &&
          row.status === 'acknowledged',
      )
    )
      void onSettled(
        null,
        'Endpoint test acknowledged. Enable delivery when you’re ready.',
      );
  }, [history.data, data.verifiedAt, data.configurationId, onSettled]);
  async function settled(error: Error | null, text: string) {
    setAcknowledgedRisk(null);
    await history.refetch();
    await onSettled(
      error instanceof FormRequestError && error.code === 'conflict'
        ? new Error(
            'The saved settings, preview or delivery changed. Refresh and prepare a new test if needed.',
          )
        : error,
      text,
    );
  }
  const prepare = useMutation({
    mutationFn: () => {
      if (!data.configurationId) throw Error('Save an endpoint first.');
      previewId.current ??= crypto.randomUUID();
      return prepareWebhookPreview(workspaceId, formId, {
        configurationId: data.configurationId,
        expectedRevision: data.revision,
        deliveryId: previewId.current,
      });
    },
    retry: false,
    onMutate: onStarted,
    onSuccess: (result) => {
      setPreview(result);
      previewId.current = null;
    },
    onSettled: (_value, error) => {
      if (
        error instanceof FormRequestError &&
        ['conflict', 'invalid'].includes(error.code)
      )
        previewId.current = null;
      return settled(
        error,
        'Test preview ready. Review the destination and payload before sending.',
      );
    },
  });
  const send = useMutation({
    mutationFn: (input: WebhookSendInput) =>
      sendWebhookDelivery(workspaceId, formId, input),
    retry: false,
    onMutate: onStarted,
    onSuccess: (receipt) =>
      setPreview((current) =>
        current && current.id === receipt.id
          ? { ...current, status: 'pending' }
          : current,
      ),
    onSettled: (_value, error) =>
      settled(
        error,
        'Delivery queued. Its status below confirms what the receiver acknowledged.',
      ),
  });
  const toggle = useMutation({
    mutationFn: (input: WebhookToggleInput) =>
      toggleWebhookDelivery(workspaceId, formId, input),
    retry: false,
    onMutate: onStarted,
    onSettled: (value, error) =>
      settled(
        error,
        value?.enabled
          ? 'New responses will be sent to this endpoint.'
          : 'Delivery is off. A request already in progress may still arrive.',
      ),
  });
  const busy =
    disabled || prepare.isPending || send.isPending || toggle.isPending;
  const versionId = publication.data?.active
    ? publication.data.versionId
    : null;
  const previewStatus =
    history.data?.deliveries.find((row) => row.id === preview?.id)?.status ??
    preview?.status;
  return (
    <div className="webhook-delivery-panel">
      <h2>Test this endpoint</h2>
      <p className="notification-note">
        Preview synthetic answers from the published form. Preparing a preview
        sends nothing and uses no response allowance.
      </p>
      {publication.isPending ? (
        <p role="status">Checking the published form…</p>
      ) : publication.isError ? (
        <p role="alert">{publication.error.message}</p>
      ) : (
        !versionId && <p>Publish this form before preparing a test.</p>
      )}
      <button
        className="button secondary compact-button"
        disabled={busy || !versionId}
        onClick={() => prepare.mutate()}
      >
        {prepare.isPending ? 'Preparing…' : 'Prepare test preview'}
      </button>
      {preview && (
        <div className="webhook-payload">
          <p>
            <strong>Destination:</strong> {preview.url}
          </p>
          <p className="notification-note">
            Exact UTF-8 JSON · Published version {preview.version}. This is
            synthetic test data.
          </p>
          <label>
            Exact test payload
            <textarea
              readOnly
              rows={9}
              value={preview.payload}
              spellCheck={false}
            />
          </label>
          {preview.versionId !== versionId && (
            <p>The published form changed. Prepare a new preview.</p>
          )}
          <button
            className="button primary compact-button"
            disabled={
              busy ||
              previewStatus !== 'preview' ||
              preview.versionId !== versionId
            }
            onClick={() => {
              if (data.configurationId)
                send.mutate({
                  configurationId: data.configurationId,
                  expectedRevision: data.revision,
                  deliveryId: preview.id,
                  expectedAttempts: 0,
                  acknowledgeDuplicateRisk: false,
                });
            }}
          >
            {send.isPending
              ? 'Queuing…'
              : previewStatus === 'preview'
                ? 'Send this test'
                : `Test: ${labels[previewStatus ?? 'preview']}`}
          </button>
        </div>
      )}
      <h2>New responses</h2>
      <p className="notification-note">
        {data.verifiedAt
          ? 'Endpoint test acknowledged.'
          : 'An acknowledged test is required before enabling delivery.'}{' '}
        Enabling sends all new response answers to this destination. Existing
        responses are not backfilled.
      </p>
      <p className="notification-note">
        Receivers must deduplicate by <code>webhook-id</code>; a request can
        arrive more than once.
      </p>
      <button
        className="button secondary compact-button"
        disabled={busy || (!data.enabled && !data.verifiedAt)}
        onClick={() => {
          if (data.configurationId)
            toggle.mutate({
              configurationId: data.configurationId,
              expectedRevision: data.revision,
              enabled: !data.enabled,
            });
        }}
      >
        {toggle.isPending
          ? 'Saving…'
          : data.enabled
            ? 'Turn delivery off'
            : 'Enable for new responses'}
      </button>
      <h2>Recent deliveries</h2>
      <button
        className="text-button"
        disabled={busy || history.isFetching || publication.isFetching}
        onClick={() => {
          onStarted();
          void Promise.all([history.refetch(), publication.refetch()]).then(
            () => onSettled(null, 'Delivery status refreshed.'),
          );
        }}
      >
        Refresh delivery status
      </button>
      {history.isPending ? (
        <p role="status">Loading deliveries…</p>
      ) : history.isError ? (
        <p role="alert">{history.error.message}</p>
      ) : history.data.deliveries.length === 0 ? (
        <p>No deliveries yet. Start with a test preview.</p>
      ) : (
        <>
          <p className="notification-note">
            Latest 20 requests, including previews. Times use your device’s
            timezone.
          </p>
          <ol className="notification-list">
            {history.data.deliveries.map((row) => (
              <li key={row.id}>
                <strong>
                  {row.kind === 'test' ? 'Test' : 'Response'} ·{' '}
                  {labels[row.status]}
                </strong>
                <code>{row.id}</code>
                <p className="notification-note">
                  {dates.format(new Date(row.createdAt))} · {row.attempts} of 8
                  attempts{row.httpStatus ? ` · HTTP ${row.httpStatus}` : ''}
                  {row.configurationId !== data.configurationId
                    ? ' · Previous endpoint'
                    : ''}
                </p>
                {row.reason && <p>{reasons[row.reason]}</p>}
                {row.status === 'pending' && row.attempts > 0 && (
                  <p>Next attempt: {dates.format(new Date(row.availableAt))}</p>
                )}
                {canOfferWebhookRetry(row, {
                  configurationId: data.configurationId,
                  enabled: data.enabled,
                  versionId,
                }) && (
                  <div>
                    {row.status === 'unknown' && (
                      <label className="webhook-risk">
                        <input
                          type="checkbox"
                          checked={acknowledgedRisk === row.id}
                          onChange={(event) =>
                            setAcknowledgedRisk(
                              event.target.checked ? row.id : null,
                            )
                          }
                        />
                        I accept that retrying may duplicate an action the
                        receiver already completed.
                      </label>
                    )}
                    <button
                      className="button secondary compact-button"
                      disabled={
                        busy ||
                        (row.status === 'unknown' &&
                          acknowledgedRisk !== row.id)
                      }
                      aria-label={`Retry ${row.kind === 'test' ? 'test' : 'response'} ${row.id}`}
                      onClick={() => {
                        if (data.configurationId)
                          send.mutate({
                            configurationId: data.configurationId,
                            expectedRevision: data.revision,
                            deliveryId: row.id,
                            expectedAttempts: row.attempts,
                            acknowledgeDuplicateRisk:
                              row.status === 'unknown' &&
                              acknowledgedRisk === row.id,
                          });
                      }}
                    >
                      Retry delivery
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
