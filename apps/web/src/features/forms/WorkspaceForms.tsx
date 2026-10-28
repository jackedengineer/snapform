import { useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { CreateForm } from '@snapform/contracts/draft';
import { can } from '@snapform/contracts/workspace';
import { useAccountUser } from '../auth/AccountLayout';
import { fetchForms, createFormRequest } from './api';
import { newBlankDefinition } from './new-form';
const dates = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
export function WorkspaceForms({ workspaceId }: { workspaceId: string }) {
  const user = useAccountUser(),
    navigate = useNavigate();
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: ['forms', user.id, workspaceId, cursor],
    queryFn: ({ signal }) => fetchForms(workspaceId, cursor, signal),
  });
  const pending = useRef<CreateForm | null>(null),
    busy = useRef(false);
  const mutation = useMutation({
    mutationFn: (input: CreateForm) => createFormRequest(workspaceId, input),
  });
  async function create() {
    if (busy.current) return;
    busy.current = true;
    pending.current ||= {
      id: crypto.randomUUID(),
      definition: newBlankDefinition(),
    };
    try {
      const form = await mutation.mutateAsync(pending.current);
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
      {query.isPending ? (
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
                Thoughtful questions. Useful answers.
              </p>
            </div>
            {can(query.data.workspace.role, 'forms.write') && (
              <button
                className="button primary compact-button"
                disabled={mutation.isPending}
                onClick={() => void create()}
              >
                {mutation.isPending ? 'Creating…' : 'New form'}
                <span aria-hidden="true">+</span>
              </button>
            )}
          </div>
          {mutation.isError && (
            <p role="alert" className="request-error">
              {mutation.error.message}
            </p>
          )}
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
                    <span className="draft-badge">Draft</span>
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
        </>
      )}
    </div>
  );
}
