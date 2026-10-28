import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, useStore } from '@tanstack/react-form';
import type { Block } from '@snapform/contracts/form';
import type { FormSnapshot, SaveDraft } from '@snapform/contracts/draft';
import { compileDefinition } from '@snapform/contracts/compile';
import { can } from '@snapform/contracts/workspace';
import { useAccountUser } from '../auth/AccountLayout';
import { fetchForm, saveDraftRequest, FormRequestError } from './api';
import { blockNames, newBlock, duplicateBlock } from './new-form';
import { BlockInspector } from './BlockInspector';
import { DraftRecovery } from './DraftRecovery';
import { recoverDraft } from './recover-draft';
export function FormEditor({
  workspaceId,
  formId,
}: {
  workspaceId: string;
  formId: string;
}) {
  const user = useAccountUser();
  const query = useQuery({
    queryKey: ['draft', user.id, workspaceId, formId],
    queryFn: ({ signal }) => fetchForm(workspaceId, formId, signal),
    refetchOnWindowFocus: false,
  });
  if (query.isPending)
    return (
      <div className="workspace-home">
        <p role="status">Opening your form…</p>
      </div>
    );
  if (query.isError)
    return (
      <div className="workspace-home">
        <h1>Let’s reconnect.</h1>
        <p role="alert">{query.error.message}</p>
        <button className="text-button" onClick={() => void query.refetch()}>
          Try again
        </button>
        <Link to="/app">Back to workspaces</Link>
      </div>
    );
  return <Editor key={query.data.id} snapshot={query.data} />;
}
function Editor({ snapshot }: { snapshot: FormSnapshot }) {
  const { rules: initialRules, ...initialValues } = snapshot.definition;
  const [rules, setRules] = useState(initialRules);
  const [role, setRole] = useState(snapshot.role);
  const [revision, setRevision] = useState(snapshot.revision),
    [selected, setSelected] = useState<string | null>(
      snapshot.definition.pages[0].blocks[0]?.id || null,
    );
  const [type, setType] = useState<Block['type']>('short-text'),
    [conflict, setConflict] = useState(false),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState('');
  const [backup, setBackup] = useState<typeof snapshot.definition | null>(null);
  const pending = useRef<SaveDraft | null>(null),
    busy = useRef(false),
    acknowledged = useRef(
      JSON.stringify({ ...initialValues, rules: initialRules }),
    );
  const editable = can(role, 'forms.write');
  const mutation = useMutation({
    mutationFn: (input: SaveDraft) =>
      saveDraftRequest(snapshot.workspaceId, snapshot.id, input),
  });
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      if (!editable || busy.current || conflict) return;
      busy.current = true;
      pending.current ||= {
        operationId: crypto.randomUUID(),
        expectedRevision: revision,
        definition: structuredClone({ ...value, rules }),
      };
      const operation = pending.current;
      try {
        const result = await mutation.mutateAsync(operation);
        if (result.currentRevision !== result.revision) {
          setConflict(true);
          return;
        }
        acknowledged.current = JSON.stringify(operation.definition);
        pending.current = null;
        setRevision(result.revision);
      } catch (error) {
        if (error instanceof FormRequestError && error.code === 'conflict')
          setConflict(true);
      } finally {
        busy.current = false;
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const definition = { ...values, rules };
  const dirty = JSON.stringify(definition) !== acknowledged.current;
  const compilation = compileDefinition(definition);
  const blocks = definition.pages.flatMap((page) => page.blocks),
    block = blocks.find((item) => item.id === selected);
  const selectedPage = definition.pages.find((page) =>
    page.blocks.some((item) => item.id === selected),
  );
  const selectedIndex =
    selectedPage?.blocks.findIndex((item) => item.id === selected) ?? -1;
  const answerCount = blocks.filter((item) => 'required' in item).length;
  const contentType = type === 'heading' || type === 'help';
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function update(block: Block) {
    form.setFieldValue('pages', (pages) =>
      pages.map((page) => ({
        ...page,
        blocks: page.blocks.map((item) =>
          item.id === block.id ? block : item,
        ),
      })),
    );
  }
  function add() {
    const next = newBlock(type);
    form.setFieldValue('pages', (pages) =>
      pages.map((page, index) =>
        index === 0 ? { ...page, blocks: [...page.blocks, next] } : page,
      ),
    );
    setSelected(next.id);
  }
  function move(direction: number) {
    if (!block) return;
    const trigger = document.activeElement;
    form.setFieldValue('pages', (pages) =>
      pages.map((page) => {
        const index = page.blocks.findIndex((item) => item.id === block.id),
          next = index + direction;
        if (index < 0 || next < 0 || next >= page.blocks.length) return page;
        const reordered = [...page.blocks];
        [reordered[index], reordered[next]] = [
          reordered[next],
          reordered[index],
        ];
        return { ...page, blocks: reordered };
      }),
    );
    requestAnimationFrame(() => {
      if (trigger instanceof HTMLButtonElement && trigger.disabled)
        document.getElementById(`question-${block.id}`)?.focus();
    });
  }
  function duplicate() {
    if (!block) return;
    const copy = duplicateBlock(block);
    form.setFieldValue('pages', (pages) =>
      pages.map((page) => ({
        ...page,
        blocks: page.blocks.flatMap((item) =>
          item.id === block.id ? [item, copy] : [item],
        ),
      })),
    );
    setSelected(copy.id);
  }
  async function loadSaved() {
    setLoading(true);
    setLoadError('');
    try {
      const latest = await fetchForm(snapshot.workspaceId, snapshot.id);
      setBackup(structuredClone(definition));
      const { rules: nextRules, values: nextValues } = recoverDraft(
        form,
        latest.definition,
      );
      setRules(nextRules);
      setRole(latest.role);
      setRevision(latest.revision);
      acknowledged.current = JSON.stringify({
        ...nextValues,
        rules: nextRules,
      });
      pending.current = null;
      setConflict(false);
      mutation.reset();
      setSelected(latest.definition.pages[0].blocks[0]?.id || null);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Couldn’t load the saved version.',
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <form
      className="builder-home"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h1 className="visually-hidden">Form editor</h1>
      <Link className="back-link" to="/app">
        ← Back to workspaces
      </Link>
      <fieldset disabled={mutation.isPending || loading}>
        <div className="editor-header">
          <div>
            <p className="eyebrow">FORM DRAFT</p>
            <form.Field name="title">
              {(field) => (
                <textarea
                  className="form-title-input"
                  aria-label="Form title"
                  placeholder="Untitled form"
                  rows={2}
                  maxLength={120}
                  readOnly={!editable}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
            <p role="status" className="save-status" data-revision={revision}>
              {mutation.isPending
                ? 'Saving…'
                : conflict
                  ? 'Conflicting edits — your version is still here'
                  : dirty
                    ? 'Unsaved changes'
                    : 'All changes saved'}
            </p>
          </div>
          {editable && (
            <button
              className="button primary compact-button"
              type="submit"
              disabled={!dirty || conflict}
            >
              {mutation.isPending ? 'Saving…' : 'Save changes'}
              <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
        <div className="editor-grid">
          <aside className="form-outline" aria-label="Form outline">
            <div className="outline-heading">
              <h2>Your questions</h2>
              <span>{blocks.length}</span>
            </div>
            {definition.pages.map((page) => (
              <div key={page.id}>
                <h3>{page.title || 'Untitled page'}</h3>
                <ol>
                  {page.blocks.map((item, index) => (
                    <li key={item.id}>
                      <button
                        id={`question-${item.id}`}
                        type="button"
                        aria-pressed={selected === item.id}
                        onClick={() => setSelected(item.id)}
                      >
                        <span>{index + 1}</span>
                        <span>
                          {('label' in item ? item.label : item.text).trim() ||
                            'Untitled question'}
                        </span>
                        <small>{blockNames[item.type]}</small>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {editable && (
              <div className="add-block">
                <label htmlFor="block-type">Question type</label>
                <select
                  id="block-type"
                  value={type}
                  onChange={(event) => {
                    if (Object.hasOwn(blockNames, event.target.value))
                      setType(event.target.value as Block['type']);
                  }}
                >
                  {Object.entries(blockNames).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  type="button"
                  disabled={
                    contentType
                      ? blocks.length - answerCount >= 100
                      : answerCount >= 50
                  }
                  onClick={add}
                >
                  Add to form <span aria-hidden="true">+</span>
                </button>
              </div>
            )}
          </aside>
          <div className="editor-canvas">
            {block ? (
              <>
                <fieldset disabled={!editable}>
                  <BlockInspector block={block} onChange={update} />
                </fieldset>
                {editable && (
                  <div className="block-actions">
                    <button
                      className="text-button"
                      type="button"
                      disabled={selectedIndex <= 0}
                      onClick={() => move(-1)}
                    >
                      Move up ↑
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={
                        !selectedPage ||
                        selectedIndex >= selectedPage.blocks.length - 1
                      }
                      onClick={() => move(1)}
                    >
                      Move down ↓
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={duplicate}
                    >
                      Duplicate
                    </button>
                    <button
                      className="text-button danger-text"
                      type="button"
                      onClick={() => {
                        form.setFieldValue('pages', (pages) =>
                          pages.map((page) => ({
                            ...page,
                            blocks: page.blocks.filter(
                              (item) => item.id !== block.id,
                            ),
                          })),
                        );
                        setSelected(null);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="editor-empty">
                <span className="empty-symbol" aria-hidden="true">
                  ↗
                </span>
                <h2>
                  {blocks.length
                    ? 'Keep shaping your form.'
                    : 'Start with a good question.'}
                </h2>
                <p>
                  {blocks.length
                    ? 'Choose a question from the outline to edit it.'
                    : 'Choose a type from the outline, then make it yours.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </fieldset>
      {!editable && (
        <p className="request-error">
          Viewer access. Ask an owner or editor to make changes.
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="request-error">
          {mutation.error.message}
        </p>
      )}
      {(conflict || mutation.isError) && (
        <DraftRecovery loading={loading} onReload={() => void loadSaved()} />
      )}
      {backup && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            const { rules: previousRules } = recoverDraft(form, backup);
            setRules(previousRules);
            setBackup(null);
          }}
        >
          Restore previous edit
        </button>
      )}
      {loadError && (
        <p role="alert" className="request-error">
          {loadError}
        </p>
      )}
      {!compilation.ok && (
        <section className="definition-checks" aria-labelledby="checks-title">
          <h2 id="checks-title">Before this form can go live</h2>
          <ul>
            {compilation.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                {blocks.some((item) => item.id === issue.targetId) ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      issue.targetId && setSelected(issue.targetId)
                    }
                  >
                    {issue.message}
                  </button>
                ) : (
                  <span>{issue.message}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </form>
  );
}
