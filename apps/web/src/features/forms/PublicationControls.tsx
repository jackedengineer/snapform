import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import type {
  PublishForm,
  UnpublishForm,
} from '@snapform/contracts/publication';
import { useAccountUser } from '../auth/AccountLayout';
import {
  fetchEmailOverview,
  saveEmailSettings,
  fetchPublication,
  publishFormRequest,
  stopPublicationRequest,
  FormRequestError,
} from './api';
import {
  publishLabel,
  publishReason,
  publishStatus,
  statusLabels,
  type OperationPhase,
  type PublishingIssue,
} from './prepare-publication';
type Options = {
  workspaceId: string;
  formId: string;
  editable: boolean;
  revision: number;
  dirty: boolean;
  prepare: () => Promise<number>;
  onBusy: (busy: boolean) => void;
};
type Operation =
  | { kind: 'publish'; input: PublishForm }
  | { kind: 'stop'; input: UnpublishForm };
// One publication state for the header action and the share panel, so both
// use the same saved-revision check and the same retry identity.
export function usePublication(options: Options) {
  const user = useAccountUser(),
    pending = useRef<Operation | null>(null),
    running = useRef(false);
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<{
    kind: Operation['kind'];
    state: OperationPhase;
  }>({ kind: 'publish', state: 'idle' });
  const query = useQuery({
    queryKey: ['publication', user.id, options.workspaceId, options.formId],
    queryFn: ({ signal }) =>
      fetchPublication(options.workspaceId, options.formId, signal),
    refetchOnWindowFocus: false,
  });
  const mutation = useMutation({
    mutationFn: async (operation: Operation) => {
      if (operation.kind === 'publish')
        await publishFormRequest(
          options.workspaceId,
          options.formId,
          operation.input,
        );
      else
        await stopPublicationRequest(
          options.workspaceId,
          options.formId,
          operation.input,
        );
    },
  });
  const publication = query.data ?? null;
  const status = query.isSuccess
    ? publishStatus(publication, options.revision, options.dirty)
    : null;
  /** Resolves true only after the server confirmed the operation. */
  async function run(kind: Operation['kind']) {
    if (
      running.current ||
      !options.editable ||
      (pending.current && pending.current.kind !== kind)
    )
      return false;
    running.current = true;
    options.onBusy(true);
    setPhase({ kind, state: 'running' });
    setMessage('');
    try {
      const operation =
        pending.current ||
        (kind === 'publish'
          ? ({
              kind,
              input: {
                versionId: crypto.randomUUID(),
                expectedRevision: await options.prepare(),
              },
            } as const)
          : publication
            ? ({
                kind,
                input: { expectedVersionId: publication.versionId },
              } as const)
            : null);
      if (!operation) throw new Error('Reload publication status first.');
      pending.current = operation;
      await mutation.mutateAsync(operation);
      pending.current = null;
      await query.refetch();
      setMessage(
        kind === 'publish'
          ? 'Published. New responses use this version.'
          : 'Collection stopped. Submitted responses stay saved.',
      );
      setPhase({ kind, state: 'idle' });
      return true;
    } catch (error) {
      if (
        error instanceof FormRequestError &&
        !['unavailable', 'rate-limited'].includes(error.code)
      ) {
        pending.current = null;
        await query.refetch();
      }
      setMessage(
        error instanceof Error
          ? error.message
          : 'Publication could not be confirmed. Retry the same operation.',
      );
      setPhase({ kind, state: pending.current ? 'failed' : 'idle' });
      return false;
    } finally {
      running.current = false;
      options.onBusy(false);
    }
  }
  return {
    query,
    publication,
    status,
    message,
    phase,
    editable: options.editable,
    userId: user.id,
    workspaceId: options.workspaceId,
    formId: options.formId,
    run,
  };
}
type Publication = ReturnType<typeof usePublication>;
export function PublishAction({
  publication,
  issues,
  save,
  onPublished,
  onReview,
}: {
  publication: Publication;
  issues: number;
  save: Parameters<typeof publishReason>[1];
  onPublished: (first: boolean) => void;
  onReview: () => void;
}) {
  const { status, phase } = publication;
  const publishing = phase.kind === 'publish' ? phase.state : 'idle';
  const reason = publishReason(issues, save);
  return (
    <div className="publish-action">
      <button
        type="button"
        className="button primary compact-button"
        aria-describedby={reason ? 'publish-reason' : undefined}
        disabled={
          !publication.editable ||
          // An exact retry of a prepared operation stays available.
          (Boolean(reason) && publishing !== 'failed') ||
          publication.query.isPending ||
          publishing === 'running' ||
          (phase.kind === 'stop' && phase.state !== 'idle') ||
          (status === 'live' && publishing === 'idle')
        }
        onClick={() => {
          const first = !publication.publication;
          void publication.run('publish').then((done) => {
            if (done) onPublished(first);
          });
        }}
      >
        {publishLabel(status || 'draft', publishing)}
      </button>
      {reason && (
        <p id="publish-reason" className="publish-reason">
          {reason}{' '}
          {issues > 0 && (
            <button type="button" className="text-button" onClick={onReview}>
              Review
            </button>
          )}
        </p>
      )}
      {publication.message && (
        <p role="status" className="publish-reason">
          {publication.message}
        </p>
      )}
    </div>
  );
}
export function StatusChip({ publication }: { publication: Publication }) {
  if (!publication.status) return null;
  return (
    <span className="status-chip" data-status={publication.status}>
      {statusLabels[publication.status]}
    </span>
  );
}
export const embedCode = (origin: string, publicId: string) =>
  `<div data-snapform="${publicId}"></div>\n<script async src="${origin}/embed.js"></script>`;
const summaries = {
  draft:
    'This form isn’t collecting responses yet. Publish it to get a share link.',
  live: 'Live and collecting responses.',
  changes:
    'Live and collecting responses. Your latest edits aren’t live yet. Publishing updates new responses; existing responses keep the version they started with.',
  stopped:
    'Collection is stopped. Publish again to reopen the same share link.',
};
export function PublicationControls({
  publication,
  issues,
  focusLink,
  onLinkFocused,
  onIssue,
  emailOffer,
  onEmailOfferDone,
}: {
  publication: Publication;
  issues: PublishingIssue[];
  focusLink: boolean;
  onLinkFocused: () => void;
  onIssue: (issue: PublishingIssue) => void;
  /** Set after a first publish; owner chooses the "Email me" wording. */
  emailOffer: { owner: boolean } | null;
  onEmailOfferDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    link = useRef<HTMLInputElement>(null),
    code = useRef<HTMLTextAreaElement>(null),
    copy = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState('');
  const { query, status, phase } = publication;
  const current = publication.publication;
  const { origin } = window.location;
  const url = current ? new URL('/f/' + current.publicId, origin).href : '';
  useEffect(() => {
    if (!focusLink || !copy.current) return;
    copy.current.focus();
    onLinkFocused();
  }, [focusLink, url, onLinkFocused]);
  async function copyField(
    field: HTMLInputElement | HTMLTextAreaElement | null,
    name: string,
  ) {
    if (!field) return;
    try {
      await navigator.clipboard.writeText(field.value);
      setCopied(name + ' copied.');
    } catch {
      field.select();
      setCopied(`Select and copy the ${name.toLowerCase()} above.`);
    }
  }
  const stopping = phase.kind === 'stop' ? phase.state : 'idle';
  return (
    <section className="publication-panel" aria-labelledby="share-title">
      <h2 id="share-title">Publish & share</h2>
      {query.isPending ? (
        <p role="status">Checking publication…</p>
      ) : query.isError ? (
        <>
          <p role="alert">{query.error.message}</p>
          <button
            type="button"
            className="text-button"
            onClick={() => void query.refetch()}
          >
            Retry status check
          </button>
        </>
      ) : (
        <>
          {status && <p>{summaries[status]}</p>}
          {issues.length > 0 && (
            <div className="definition-checks">
              <h3 id="readiness-title" tabIndex={-1}>
                Before this form can go live
              </h3>
              <ul>
                {issues.map((issue, index) => (
                  <li key={`${issue.targetId}-${index}`}>
                    {issue.targetId ? (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => onIssue(issue)}
                      >
                        {issue.message}
                      </button>
                    ) : (
                      <span>{issue.message}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {current?.active && (
            <>
              <label htmlFor="public-form-link">Share link</label>
              <input
                ref={link}
                id="public-form-link"
                type="url"
                readOnly
                value={url}
              />
              <div className="publication-actions">
                <button
                  ref={copy}
                  type="button"
                  className="button primary compact-button"
                  onClick={() => void copyField(link.current, 'Link')}
                >
                  Copy link
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Open published form ↗
                </a>
              </div>
              <details className="embed-code">
                <summary>Embed on your website</summary>
                <p>
                  Paste this code into your website’s HTML where the form should
                  appear.
                </p>
                <textarea
                  ref={code}
                  aria-label="Embed code"
                  readOnly
                  rows={3}
                  value={embedCode(origin, current.publicId)}
                />
                <button
                  type="button"
                  className="button secondary compact-button"
                  onClick={() => void copyField(code.current, 'Code')}
                >
                  Copy code
                </button>
              </details>
              {copied && <p role="status">{copied}</p>}
              {emailOffer && (
                <EmailOffer
                  workspaceId={publication.workspaceId}
                  formId={publication.formId}
                  userId={publication.userId}
                  owner={emailOffer.owner}
                  onDone={onEmailOfferDone}
                />
              )}
            </>
          )}
          {(current?.active || stopping === 'failed') && (
            <button
              type="button"
              className="text-button danger-text"
              disabled={
                !publication.editable ||
                stopping === 'running' ||
                (phase.kind === 'publish' && phase.state !== 'idle')
              }
              onClick={() =>
                stopping === 'failed'
                  ? void publication.run('stop')
                  : dialog.current?.showModal()
              }
            >
              {stopping === 'running'
                ? 'Stopping…'
                : stopping === 'failed'
                  ? 'Retry stopping'
                  : 'Stop collection'}
            </button>
          )}
        </>
      )}
      <dialog ref={dialog} className="settings-dialog">
        <h2>Stop collection?</h2>
        <p>
          This makes the form unavailable to new and unfinished responses until
          you publish again. Submitted responses stay saved.
        </p>
        <div className="publication-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => dialog.current?.close()}
          >
            Keep collecting
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              dialog.current?.close();
              void publication.run('stop');
            }}
          >
            Stop collection
          </button>
        </div>
      </dialog>
    </section>
  );
}
// Shown once after a first publish. Nothing changes until the author saves.
export function EmailOffer({
  workspaceId,
  formId,
  userId,
  owner,
  onDone,
}: {
  workspaceId: string;
  formId: string;
  userId: string;
  owner: boolean;
  onDone: () => void;
}) {
  const [wanted, setWanted] = useState(true);
  const overview = useQuery({
    queryKey: ['email-notifications', userId, workspaceId, formId],
    queryFn: ({ signal }) => fetchEmailOverview(workspaceId, formId, signal),
  });
  const change = useMutation({
    mutationFn: saveEmailSettings.bind(null, workspaceId, formId),
    retry: false,
    onSuccess: () => void overview.refetch(),
  });
  if (!overview.isSuccess) return null;
  const { settings } = overview.data;
  if (settings.enabled)
    return <p className="email-offer">Email notifications are on.</p>;
  return (
    <div className="email-offer">
      <label className="check-control">
        <input
          type="checkbox"
          checked={wanted}
          onChange={(event) => setWanted(event.target.checked)}
        />
        {owner
          ? 'Email me when someone responds'
          : 'Email the workspace owner when someone responds'}
      </label>
      <button
        type="button"
        className="text-button"
        disabled={change.isPending}
        onClick={() =>
          wanted
            ? change.mutate({
                enabled: true,
                expectedRevision: settings.revision,
              })
            : onDone()
        }
      >
        {change.isPending ? 'Saving…' : 'Save'}
      </button>
      {change.isError && <p role="alert">{change.error.message}</p>}
    </div>
  );
}
