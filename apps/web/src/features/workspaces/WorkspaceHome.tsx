import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkspaceSchema } from '@snapform/contracts/workspace';
import type { Workspace } from '@snapform/contracts/workspace';
import { createWorkspaceRequest, fetchWorkspaces } from './api';
const segments = {
  agency: 'Agency',
  coach: 'Coaching',
  consultant: 'Consulting',
  startup: 'Startup',
};
export function WorkspaceHome({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const key = ['workspaces', userId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchWorkspaces(signal),
    retry: false,
    gcTime: 0,
  });
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState('');
  const createButton = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  return (
    <section className="workspace-section" aria-labelledby="workspaces-title">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">A PLACE FOR YOUR WORK</p>
          <h2 id="workspaces-title">Your workspaces</h2>
        </div>
        {!adding && (
          <button
            className="button primary compact-button"
            ref={createButton}
            onClick={() => {
              setAdding(true);
              setCreated('');
            }}
          >
            New workspace <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
      {created && (
        <p
          role="status"
          tabIndex={-1}
          ref={confirmation}
          className="workspace-confirmation"
        >
          {created} is ready. You’re its owner.
        </p>
      )}
      {adding && (
        <NewWorkspace
          onCancel={() => {
            setAdding(false);
            requestAnimationFrame(() => createButton.current?.focus());
          }}
          onCreated={(workspace) => {
            queryClient.setQueryData<Workspace[]>(key, (previous) =>
              previous?.some((item) => item.id === workspace.id)
                ? previous
                : [workspace, ...(previous || [])],
            );
            setCreated(workspace.name);
            setAdding(false);
            requestAnimationFrame(() => confirmation.current?.focus());
            void queryClient.invalidateQueries({ queryKey: key });
          }}
        />
      )}
      {query.isPending ? (
        <p role="status" className="workspace-empty">
          Loading your workspaces…
        </p>
      ) : query.isError ? (
        <div className="workspace-empty">
          <p role="alert">{query.error.message}</p>
          <button className="text-button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : query.data.length === 0 ? (
        <div className="workspace-empty">
          <span className="empty-symbol" aria-hidden="true">
            ↗
          </span>
          <h3>Good work needs a home.</h3>
          <p>
            Create a workspace for your team, forms and incoming conversations.
          </p>
        </div>
      ) : (
        <ul className="workspace-list">
          {query.data.map((workspace) => (
            <li key={workspace.id}>
              <Link
                className="workspace-open"
                to="/workspaces/$workspaceId"
                params={{ workspaceId: workspace.id }}
                aria-label={`Open ${workspace.name}`}
              >
                <span className="workspace-monogram" aria-hidden="true">
                  {[...workspace.name][0]?.toUpperCase()}
                </span>
                <div>
                  <h3>{workspace.name}</h3>
                  <p>
                    {segments[workspace.segment]} · {workspace.role}
                  </p>
                </div>
                <span className="workspace-role" aria-hidden="true">
                  {workspace.role}
                </span>
                <span aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function NewWorkspace({
  onCreated,
  onCancel,
}: {
  onCreated: (workspace: Workspace) => void;
  onCancel: () => void;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const busy = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  const mutation = useMutation({
    mutationFn: createWorkspaceRequest,
    gcTime: 0,
  });
  const form = useForm({
    defaultValues: {
      name: '',
      segment: 'agency' as 'agency' | 'coach' | 'consultant' | 'startup',
    },
    onSubmitInvalid: () => nameInput.current?.focus(),
    onSubmit: async ({ value }) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const workspace = await mutation.mutateAsync({
          id: operationId,
          ...value,
        });
        form.reset();
        mutation.reset();
        onCreated(workspace);
      } catch {
        /* Keep the same operation ID and visible retry state after uncertainty. */
      } finally {
        busy.current = false;
      }
    },
  });
  return (
    <form
      className="workspace-create"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy.current) void form.handleSubmit();
      }}
    >
      <h3>A new beginning.</h3>
      <p className="panel-description">
        Name your workspace after your business or team. You can invite people
        later.
      </p>
      <fieldset disabled={mutation.isPending}>
        <form.Field
          name="name"
          validators={{
            onBlur: createWorkspaceSchema.shape.name,
            onSubmit: createWorkspaceSchema.shape.name,
          }}
        >
          {(field) => (
            <div className="field">
              <label htmlFor="workspace-name">Workspace name</label>
              <input
                ref={nameInput}
                id="workspace-name"
                autoComplete="organization"
                maxLength={80}
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  mutation.reset();
                }}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby="workspace-name-error"
                placeholder="e.g. Studio North"
              />
              <p id="workspace-name-error" className="field-error">
                {[
                  ...new Set(
                    field.state.meta.errors.map((error) => error?.message),
                  ),
                ].join(' ')}
              </p>
            </div>
          )}
        </form.Field>
        <form.Field name="segment">
          {(field) => (
            <div className="field">
              <label htmlFor="workspace-segment">
                What kind of work do you do?
              </label>
              <select
                id="workspace-segment"
                value={field.state.value}
                onChange={(event) => {
                  const value = createWorkspaceSchema.shape.segment.safeParse(
                    event.target.value,
                  );
                  if (value.success) field.handleChange(value.data);
                }}
              >
                {Object.entries(segments).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>
        {mutation.isError && (
          <p className="request-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <div className="workspace-actions">
          <button className="button primary compact-button" type="submit">
            {mutation.isPending ? 'Creating…' : 'Create workspace'}
            <span aria-hidden="true">↗</span>
          </button>
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
