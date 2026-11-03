import { useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateForm } from '@snapform/contracts/draft';
import { can } from '@snapform/contracts/workspace';
import { useAccountUser } from '../auth/AccountLayout';
import { fetchForms, createFormRequest, FormRequestError } from './api';
import { newBlankDefinition } from './new-form';
import { starters, newStarterDefinition, type StarterId } from './starters';
import { RetentionSettings } from './RetentionSettings';
import './retention.css';
import {
  DeletionControl,
  useDeletionStatus,
} from '../deletion/DeletionControl';
import { WorkspaceDeleted } from '../deletion/WorkspaceDeleted';
const dates = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
export function WorkspaceForms({ workspaceId }: { workspaceId: string }) {
  const user = useAccountUser(),
    navigate = useNavigate();
  const cache = useQueryClient();
  const [dataOpen, setDataOpen] = useState(false);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: ['forms', user.id, workspaceId, cursor],
    queryFn: ({ signal }) => fetchForms(workspaceId, cursor, signal),
  });
  const missing =
    query.isError &&
    query.error instanceof FormRequestError &&
    query.error.code === 'not-found';
  const deletion = useDeletionStatus(
    user.id,
    workspaceId,
    { kind: 'workspace', targetId: workspaceId },
    query.data?.workspace.role === 'owner' || missing,
  );
  const blocksWrites =
    query.data?.workspace.role === 'owner' &&
    (!deletion.isSuccess ||
      deletion.data?.state === 'scheduled' ||
      deletion.data?.state === 'purging' ||
      deletion.data?.state === 'deleted');
  const deletionPending =
    deletion.data?.state === 'scheduled' || deletion.data?.state === 'purging';
  const pending = useRef<CreateForm | null>(null),
    busy = useRef(false);
  const mutation = useMutation({
    mutationFn: (input: CreateForm) => createFormRequest(workspaceId, input),
  });
  async function create(starter?: StarterId) {
    if (busy.current || blocksWrites) return;
    busy.current = true;
    pending.current ||= {
      id: crypto.randomUUID(),
      definition: starter
        ? newStarterDefinition(starter)
        : newBlankDefinition(),
    };
    try {
      const form = await mutation.mutateAsync(pending.current);
      cache.setQueryData(['draft', user.id, workspaceId, form.id], form);
      await navigate({
        to: '/workspaces/$workspaceId/forms/$formId',
        params: { workspaceId, formId: form.id },
      });
    } catch {
      /* The mutation keeps its visible error and the same creation identity. */
    } finally {
      busy.current = false;
    }
  }
  return (
    <div className="workspace-home">
      <Link className="back-link" to="/app">
        ← All workspaces
      </Link>
      {deletion.data?.state === 'deleted' ? (
        <WorkspaceDeleted receipt={deletion.data} />
      ) : query.isPending ? (
        <p role="status">Loading your forms…</p>
      ) : query.isError ? (
        <div className="workspace-empty">
          <h1>Let’s reconnect.</h1>
          <p role="alert">{query.error.message}</p>
          <button className="text-button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">{query.data.workspace.role} WORKSPACE</p>
              <h1>{query.data.workspace.name}</h1>
              <p className="intro-copy">
                Start with a question. Turn the answers into your next step.
              </p>
            </div>
            {can(query.data.workspace.role, 'forms.write') && (
              <button
                className="button primary compact-button"
                disabled={
                  mutation.isPending || mutation.isError || blocksWrites
                }
                onClick={() => void create()}
              >
                {mutation.isPending ? 'Creating…' : 'Blank form'}
                <span aria-hidden="true">+</span>
              </button>
            )}
          </div>
          {deletionPending && (
            <p role="status" className="deletion-status">
              Workspace deletion is scheduled. Collection and changes are
              stopped. <a href="#workspace-data-title">View deletion status</a>.
            </p>
          )}
          {mutation.isError && (
            <p role="alert" className="request-error">
              {mutation.error.message}{' '}
              <button
                type="button"
                className="text-button"
                onClick={() => void create()}
              >
                Retry creating the same form
              </button>
            </p>
          )}
          {can(query.data.workspace.role, 'forms.write') && (
            <section className="form-starters" aria-labelledby="starter-title">
              <div className="starter-heading">
                <h2 id="starter-title">A head start, if you need one.</h2>
                <p>Useful questions. All yours to change.</p>
              </div>
              <div className="starter-list">
                {starters.map((starter, index) => (
                  <button
                    type="button"
                    key={starter.id}
                    disabled={
                      mutation.isPending || mutation.isError || blocksWrites
                    }
                    onClick={() => void create(starter.id)}
                  >
                    <span className="starter-number" aria-hidden="true">
                      0{index + 1} ↗
                    </span>
                    <strong>{starter.title}</strong>
                    <span>{starter.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <h2 className="forms-section-title">Your forms</h2>
          {query.data.forms.length === 0 ? (
            <div className="workspace-empty">
              <span className="empty-symbol" aria-hidden="true">
                ↗
              </span>
              <h2>Your next conversation starts here.</h2>
              <p>
                {can(query.data.workspace.role, 'forms.write')
                  ? 'Create a form and give your questions a place to live.'
                  : 'An owner or editor can add your first form.'}
              </p>
            </div>
          ) : (
            <ul className="form-list">
              {query.data.forms.map((form) => (
                <li key={form.id}>
                  <Link
                    to="/workspaces/$workspaceId/forms/$formId"
                    params={{ workspaceId, formId: form.id }}
                  >
                    <span className="form-icon" aria-hidden="true">
                      ≡
                    </span>
                    <div>
                      <h2>{form.title.trim() || 'Untitled form'}</h2>
                      <p>Edited {dates.format(new Date(form.updatedAt))}</p>
                    </div>
                    <span className="draft-badge">Edit form</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {(cursors.length > 1 || query.data.nextCursor) && (
            <nav className="pagination" aria-label="Form pages">
              <button
                className="text-button"
                disabled={cursors.length === 1}
                onClick={() => setCursors((previous) => previous.slice(0, -1))}
              >
                ← Previous
              </button>
              <span>{query.data.forms.length} forms on this page</span>
              <button
                className="text-button"
                disabled={!query.data.nextCursor}
                onClick={() =>
                  setCursors((previous) => [
                    ...previous,
                    query.data.nextCursor || undefined,
                  ])
                }
              >
                Next →
              </button>
            </nav>
          )}
          <details
            className="workspace-data-settings"
            onToggle={(event) => setDataOpen(event.currentTarget.open)}
          >
            <summary id="workspace-data-title">Data and privacy</summary>
            {dataOpen && (
              <>
                <RetentionSettings
                  key={`${user.id}:${workspaceId}`}
                  workspaceId={workspaceId}
                  userId={user.id}
                  blocked={blocksWrites}
                />
                {query.data.workspace.role === 'owner' && (
                  <DeletionControl
                    key={`workspace-deletion:${workspaceId}`}
                    userId={user.id}
                    workspaceId={workspaceId}
                    target={{ kind: 'workspace', targetId: workspaceId }}
                    confirmation={query.data.workspace.name}
                    role={query.data.workspace.role}
                  />
                )}
              </>
            )}
          </details>
        </>
      )}
    </div>
  );
}
