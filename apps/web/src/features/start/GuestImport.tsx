import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFormRequest, fetchForm } from '../forms/api';
import { createWorkspaceRequest, fetchWorkspaces } from '../workspaces/api';
import {
  guestDraftKey,
  importPlan,
  readGuestDraft,
  type GuestDraft,
} from './guest-draft';
import './start.css';

function forget() {
  try {
    localStorage.removeItem(guestDraftKey);
  } catch {
    // Nothing to remove without storage.
  }
}
// After sign-in, a form built before signing up becomes this account's: one
// click adds it to a workspace (a new one named after the business, or one
// the person can already edit) and opens it ready to publish.
export function GuestImport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [discarding, setDiscarding] = useState(false);
  useEffect(() => {
    let value: GuestDraft | null = null;
    try {
      value = readGuestDraft(localStorage.getItem(guestDraftKey), Date.now());
    } catch {
      value = null;
    }
    setDraft(value);
    if (!value) return;
    void fetchWorkspaces()
      .then((workspaces) => {
        const plan = importPlan(value, workspaces);
        setWorkspaceName(
          plan.kind === 'create'
            ? plan.workspace.name
            : (workspaces.find((item) => item.id === plan.workspaceId)?.name ??
                ''),
        );
      })
      .catch(() => setWorkspaceName(''));
  }, []);
  const add = useMutation({
    mutationFn: async (value: GuestDraft) => {
      const workspaces = await fetchWorkspaces();
      const plan = importPlan(value, workspaces);
      let workspaceId: string;
      if (plan.kind === 'existing') workspaceId = plan.workspaceId;
      else {
        // A retry after a lost reply finds the workspace it already made.
        const made = workspaces.find((item) => item.id === plan.workspace.id);
        workspaceId = made
          ? made.id
          : (await createWorkspaceRequest(plan.workspace)).id;
      }
      try {
        await createFormRequest(workspaceId, {
          id: value.formId,
          definition: value.definition,
        });
      } catch (error) {
        // The same retry rule: a form that already exists was made by us.
        await fetchForm(workspaceId, value.formId).catch(() => {
          throw error;
        });
      }
      return { workspaceId, formId: value.formId };
    },
    onSuccess: async ({ workspaceId, formId }) => {
      forget();
      await queryClient.invalidateQueries();
      await navigate({
        to: '/workspaces/$workspaceId/forms/$formId',
        params: { workspaceId, formId },
      });
    },
  });
  if (!draft) return null;
  const title = draft.definition.title.trim() || 'Your form';
  return (
    <section className="guest-import" aria-labelledby="guest-import-title">
      <div>
        <h2 id="guest-import-title">Finish publishing “{title}”</h2>
        <p>
          {workspaceName
            ? `It goes into ${workspaceName}, ready to publish.`
            : 'It goes into a workspace, ready to publish.'}
        </p>
        {add.isError && (
          <p role="alert" className="request-error">
            We couldn’t add your form. It’s still saved on this device; try
            again.
          </p>
        )}
      </div>
      <div className="guest-import-actions">
        {discarding ? (
          <>
            <p role="alert">It exists only on this device. Discard it?</p>
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => {
                forget();
                setDraft(null);
              }}
            >
              Discard
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setDiscarding(false)}
            >
              Keep it
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="button primary compact-button"
              disabled={add.isPending}
              onClick={() => add.mutate(draft)}
            >
              {add.isPending ? 'Adding…' : 'Continue to publish'}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={add.isPending}
              onClick={() => setDiscarding(true)}
            >
              Discard it
            </button>
          </>
        )}
      </div>
    </section>
  );
}
