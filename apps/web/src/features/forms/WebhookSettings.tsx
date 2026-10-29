import { useState, useRef, useEffect, useId } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { WebhookSettings as Settings } from '@snapform/contracts/webhook-settings';
import {
  fetchWebhookSettings,
  saveWebhookSettings,
  revealWebhookSecret,
} from './webhook-api';
import { FormRequestError } from './api';
type Props = { workspaceId: string; formId: string; userId: string };
export function WebhookSettings(props: Props) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const status = useRef<HTMLParagraphElement>(null);
  const settings = useQuery({
    queryKey: [
      'webhook-settings',
      props.userId,
      props.workspaceId,
      props.formId,
    ],
    enabled: open,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      fetchWebhookSettings(props.workspaceId, props.formId, signal),
  });
  return (
    <details
      className="email-notifications webhook-settings"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (!event.currentTarget.open) setNotice(null);
      }}
    >
      <summary>
        Signed webhooks{' '}
        {settings.data && (
          <span className="delivery-setting">
            {settings.data.enabled ? 'On' : 'Off'}
          </span>
        )}
      </summary>
      {open && (
        <div className="notification-content">
          <p>Send new responses to your own HTTPS endpoint.</p>
          <p className="notification-note">
            Delivery stays off until an endpoint test is acknowledged. Saving an
            endpoint replaces its signing key and turns delivery off.
          </p>
          <p
            ref={status}
            tabIndex={-1}
            role={notice?.error ? 'alert' : 'status'}
          >
            {notice?.text}
          </p>
          {settings.isPending ? (
            <p role="status">Loading webhook settings…</p>
          ) : settings.isError ? (
            <p role="alert">{settings.error.message}</p>
          ) : (
            <WebhookEndpointForm
              key={`${settings.data.configurationId}:${settings.data.revision}`}
              {...props}
              data={settings.data}
              onStarted={() => setNotice(null)}
              onSettled={async (error) => {
                setNotice({
                  text:
                    error?.message ??
                    'Endpoint saved. Delivery remains off until its test is acknowledged.',
                  error: Boolean(error),
                });
                if (!(
                  error instanceof FormRequestError && error.code === 'invalid'
                ))
                  await settings.refetch();
                status.current?.focus();
              }}
            />
          )}
          <button
            className="text-button"
            disabled={settings.isFetching}
            onClick={() => {
              setNotice(null);
              void settings.refetch();
            }}
          >
            Refresh saved endpoint
          </button>
        </div>
      )}
    </details>
  );
}
type Reveal =
  | { status: 'idle' | 'pending' }
  | { status: 'shown'; value: string }
  | { status: 'error'; message: string };
function WebhookEndpointForm({
  workspaceId,
  formId,
  data,
  onSettled,
  onStarted,
}: Props & {
  data: Settings;
  onStarted: () => void;
  onSettled: (error: Error | null) => Promise<void>;
}) {
  const inputId = useId(),
    noteId = useId();
  const [url, setUrl] = useState(data.url ?? '');
  const [reveal, setReveal] = useState<Reveal>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function clearKey() {
    controller.current?.abort();
    setReveal({ status: 'idle' });
  }
  const save = useMutation({
    mutationFn: saveWebhookSettings.bind(null, workspaceId, formId),
    retry: false,
    onMutate: () => {
      clearKey();
      onStarted();
    },
    onSettled: (_result, error) => onSettled(error),
  });
  const busy = save.isPending || reveal.status === 'pending';
  const changed = url !== data.url;
  return (
    <>
      <form
        className="webhook-endpoint-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy)
            save.mutate({
              configurationId: crypto.randomUUID(),
              url,
              expectedRevision: data.revision,
            });
        }}
      >
        <label htmlFor={inputId}>Webhook endpoint</label>
        <input
          id={inputId}
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            clearKey();
          }}
          required
          maxLength={2048}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={noteId}
          readOnly={busy}
        />
        <p id={noteId} className="notification-note">
          Use a public HTTPS URL on port 443, without a username, password or
          fragment.
        </p>
        <button className="button primary compact-button" aria-disabled={busy}>
          {save.isPending
            ? 'Saving…'
            : data.configurationId
              ? 'Save endpoint and replace key'
              : 'Save endpoint'}
        </button>
      </form>
      {data.configurationId && (
        <div className="webhook-key">
          <button
            type="button"
            className="text-button"
            disabled={changed}
            aria-disabled={busy}
            onClick={async () => {
              if (busy || !data.configurationId) return;
              if (reveal.status === 'shown') {
                clearKey();
                return;
              }
              const pending = new AbortController();
              controller.current = pending;
              setReveal({ status: 'pending' });
              try {
                const value = await revealWebhookSecret(
                  workspaceId,
                  formId,
                  {
                    configurationId: data.configurationId,
                    expectedRevision: data.revision,
                  },
                  pending.signal,
                );
                if (!pending.signal.aborted)
                  setReveal({ status: 'shown', value: value.secret });
              } catch (error) {
                if (!pending.signal.aborted)
                  setReveal({
                    status: 'error',
                    message:
                      error instanceof Error
                        ? error.message
                        : 'The key is unavailable. Try again.',
                  });
              }
            }}
          >
            {reveal.status === 'shown'
              ? 'Hide signing key'
              : reveal.status === 'pending'
                ? 'Loading signing key…'
                : 'Reveal signing key'}
          </button>
          {changed && (
            <p className="notification-note">
              Save the endpoint before revealing its key.
            </p>
          )}
          {reveal.status === 'shown' && (
            <label>
              Signing key — keep private
              <input
                readOnly
                value={reveal.value}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}
          {reveal.status === 'error' && <p role="alert">{reveal.message}</p>}
        </div>
      )}
    </>
  );
}
