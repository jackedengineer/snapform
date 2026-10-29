import { useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import type {
  PublishForm,
  UnpublishForm,
} from '@snapform/contracts/publication';
import { useAccountUser } from '../auth/AccountLayout';
import {
  fetchPublication,
  publishFormRequest,
  stopPublicationRequest,
  FormRequestError,
} from './api';
type Props = {
  workspaceId: string;
  formId: string;
  editable: boolean;
  revision: number;
  dirty: boolean;
  blocked: string;
  prepare: () => Promise<number>;
  onBusy: (busy: boolean) => void;
};
type Operation =
  | { kind: 'publish'; input: PublishForm }
  | { kind: 'stop'; input: UnpublishForm };
export function PublicationControls(props: Props) {
  const [loaded, setLoaded] = useState(false);
  return (
    <details
      className="page-controls"
      onToggle={(event) => {
        if (event.currentTarget.open) setLoaded(true);
      }}
    >
      <summary>Publish & share</summary>
      {loaded && <PublicationPanel {...props} />}
    </details>
  );
}
function PublicationPanel(props: Props) {
  const user = useAccountUser(),
    pending = useRef<Operation | null>(null),
    running = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    link = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['publication', user.id, props.workspaceId, props.formId],
    queryFn: ({ signal }) =>
      fetchPublication(props.workspaceId, props.formId, signal),
    refetchOnWindowFocus: false,
  });
  const mutation = useMutation({
    mutationFn: async (operation: Operation) => {
      if (operation.kind === 'publish')
        await publishFormRequest(
          props.workspaceId,
          props.formId,
          operation.input,
        );
      else
        await stopPublicationRequest(
          props.workspaceId,
          props.formId,
          operation.input,
        );
    },
  });
  const publication = query.data;
  const url = publication
    ? new URL('/f/' + publication.publicId, window.location.origin).href
    : '';
  async function run(kind: Operation['kind']) {
    if (
      running.current ||
      !props.editable ||
      (pending.current && pending.current.kind !== kind)
    )
      return;
    running.current = true;
    props.onBusy(true);
    setMessage('Checking the saved revision…');
    try {
      const operation =
        pending.current ||
        (kind === 'publish'
          ? ({
              kind,
              input: {
                versionId: crypto.randomUUID(),
                expectedRevision: await props.prepare(),
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
        kind === 'publish' ? 'Publication confirmed.' : 'Collection stopped.',
      );
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
    } finally {
      running.current = false;
      props.onBusy(false);
    }
  }
  const current =
    publication?.active &&
    publication.sourceRevision === props.revision &&
    !props.dirty;
  return (
    <div className="publication-panel">
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
          <p>
            {publication?.active
              ? `Live · version ${publication.number} · draft revision ${publication.sourceRevision}`
              : 'Not collecting responses'}
          </p>
          {publication?.active && (
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
                  type="button"
                  className="text-button"
                  onClick={() => {
                    void (async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        setMessage('Link copied.');
                      } catch {
                        link.current?.select();
                        setMessage('Select and copy the link above.');
                      }
                    })();
                  }}
                >
                  Copy link
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Open published form ↗
                </a>
              </div>
            </>
          )}
          {props.blocked && (
            <p role="alert" className="request-error">
              {props.blocked}
            </p>
          )}
          {!current && publication?.active && (
            <p>
              Draft changes are not live yet. Publishing updates new responses;
              existing responses keep their original version.
            </p>
          )}
          <div className="publication-actions">
            <button
              type="button"
              className="button primary compact-button"
              disabled={
                !props.editable ||
                Boolean(props.blocked && pending.current?.kind !== 'publish') ||
                mutation.isPending ||
                Boolean(current && !pending.current) ||
                pending.current?.kind === 'stop'
              }
              onClick={() => void run('publish')}
            >
              {pending.current?.kind === 'publish'
                ? 'Retry publication'
                : current
                  ? 'Published'
                  : 'Publish saved changes'}
            </button>
            {(publication?.active || pending.current?.kind === 'stop') && (
              <button
                type="button"
                className="text-button"
                disabled={
                  !props.editable ||
                  mutation.isPending ||
                  pending.current?.kind === 'publish'
                }
                onClick={() =>
                  pending.current?.kind === 'stop'
                    ? void run('stop')
                    : dialog.current?.showModal()
                }
              >
                {pending.current?.kind === 'stop'
                  ? 'Retry stopping'
                  : 'Stop collection'}
              </button>
            )}
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
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
              void run('stop');
            }}
          >
            Stop collection
          </button>
        </div>
      </dialog>
    </div>
  );
}
