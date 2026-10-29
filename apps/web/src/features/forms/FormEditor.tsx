import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm, useStore } from '@tanstack/react-form';
import type { Block } from '@snapform/contracts/form';
import type { FormSnapshot } from '@snapform/contracts/draft';
import { compileDefinition } from '@snapform/contracts/compile';
import { can } from '@snapform/contracts/workspace';
import { useAccountUser } from '../auth/AccountLayout';
import { fetchForm } from './api';
import { useDraftAutosave } from './use-draft-autosave';
import { blockNames, newBlock, duplicateBlock } from './new-form';
import { BlockInspector } from './BlockInspector';
import { DraftRecovery } from './DraftRecovery';
import { recoverDraft } from './recover-draft';
import { PageControls } from './PageControls';
import { moveBlockToPage } from './pages';
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
        <Link to="/workspaces/$workspaceId" params={{ workspaceId }}>
          Back to forms
        </Link>
      </div>
    );
  return <Editor key={query.data.id} snapshot={query.data} />;
}
function Editor({ snapshot }: { snapshot: FormSnapshot }) {
  const { rules: initialRules, ...initialValues } = snapshot.definition;
  const [rules, setRules] = useState(initialRules);
  const [role, setRole] = useState(snapshot.role);
  const user = useAccountUser();
  const autosave = useDraftAutosave(snapshot, user.id);
  const ready = autosave.state !== null;
  const status = autosave.state?.status || 'saved';
  const saving = status === 'saving';
  const conflict = status === 'conflict';
  const revision = autosave.state?.record.revision || snapshot.revision;
  const [selected, setSelected] = useState<string | null>(
    snapshot.definition.pages[0].blocks[0]?.id || null,
  );
  const [activePageId, setActivePageId] = useState(
    snapshot.definition.pages[0].id,
  );
  const [type, setType] = useState<Block['type']>('short-text');
  const [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState('');
  const [backup, setBackup] = useState<typeof snapshot.definition | null>(null);
  const editable = can(role, 'forms.write');
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async () => {
      await autosave.flush();
    },
  });
  autosave.capture.current = () => ({ ...form.state.values, rules });
  const values = useStore(form.store, (state) => state.values);
  const definition = { ...values, rules };
  const dirty = status !== 'saved';
  useEffect(() => {
    if (editable && ready) autosave.edit({ ...values, rules });
  }, [values, rules, editable, ready, autosave.edit]);
  const compilation = compileDefinition(definition);
  const blocks = definition.pages.flatMap((page) => page.blocks),
    block = blocks.find((item) => item.id === selected);
  const selectedPage = definition.pages.find((page) =>
    page.blocks.some((item) => item.id === selected),
  );
  const activePage =
    selectedPage ||
    definition.pages.find((page) => page.id === activePageId) ||
    definition.pages[0];
  function selectPage(id: string) {
    // Adding a page updates the form store before this render snapshot changes.
    if (!form.state.values.pages.some((page) => page.id === id)) return;
    setActivePageId(id);
    setSelected(null);
  }
  const selectedIndex =
    selectedPage?.blocks.findIndex((item) => item.id === selected) ?? -1;
  const answerCount = blocks.filter((item) => 'required' in item).length;
  const contentType = type === 'heading' || type === 'help';

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
      pages.map((page) =>
        page.id === activePage.id
          ? { ...page, blocks: [...page.blocks, next] }
          : page,
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
      if (
        !autosave.accept(latest.revision, { ...nextValues, rules: nextRules })
      )
        throw new Error('Please wait for the current save, then try again.');
      setActivePageId(latest.definition.pages[0].id);
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
      <Link
        className="back-link"
        to="/workspaces/$workspaceId"
        params={{ workspaceId: snapshot.workspaceId }}
      >
        ← Back to forms
      </Link>
      <fieldset disabled={loading || (editable && !ready)}>
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
              {!ready && editable
                ? 'Preparing local recovery…'
                : saving
                  ? 'Saving…'
                  : conflict
                    ? 'Conflicting edits — your version is still here'
                    : status === 'blocked'
                      ? 'Saving paused — review the message below'
                      : status === 'offline'
                        ? autosave.state?.buffered
                          ? 'Saved on this device — reconnect to sync'
                          : 'Not saved — keep this tab open'
                        : dirty
                          ? 'Saving shortly…'
                          : 'All changes saved'}
            </p>
          </div>
          {editable && (
            <button
              className="button primary compact-button"
              type="submit"
              disabled={!dirty || conflict || saving || status === 'blocked'}
            >
              {saving ? 'Saving…' : 'Save now'}
              <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
        <PageControls
          definition={definition}
          pageId={activePage.id}
          editable={editable}
          onChange={(pages) => form.setFieldValue('pages', pages)}
          onSelect={selectPage}
        />
        <div className="editor-grid">
          <aside className="form-outline" aria-label="Form outline">
            <div className="outline-heading">
              <h2>Your questions</h2>
              <span>{blocks.length}</span>
            </div>
            {definition.pages.map((page) => (
              <div key={page.id}>
                <h3>
                  <button
                    className="page-name-button"
                    type="button"
                    aria-current={
                      activePage.id === page.id ? 'true' : undefined
                    }
                    onClick={() => selectPage(page.id)}
                  >
                    {page.title || 'Untitled page'}
                  </button>
                </h3>
                <ol>
                  {page.blocks.map((item, index) => (
                    <li key={item.id}>
                      <button
                        id={`question-${item.id}`}
                        type="button"
                        aria-pressed={selected === item.id}
                        onClick={() => {
                          setActivePageId(page.id);
                          setSelected(item.id);
                        }}
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
                    {definition.pages.length > 1 && selectedPage && (
                      <div className="field move-page-field">
                        <label htmlFor="move-question-page">Move to page</label>
                        <select
                          id="move-question-page"
                          value={selectedPage.id}
                          onChange={(event) => {
                            const next = moveBlockToPage(
                              definition,
                              block.id,
                              event.target.value,
                            );
                            if (!next) return;
                            form.setFieldValue('pages', next.pages);
                            setActivePageId(event.target.value);
                          }}
                        >
                          {definition.pages.map((page) => (
                            <option key={page.id} value={page.id}>
                              {page.title || 'Untitled page'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

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
                  {activePage.blocks.length
                    ? 'Keep shaping your form.'
                    : 'This page is ready for questions.'}
                </h2>
                <p>
                  {activePage.blocks.length
                    ? 'Choose a question from the outline to edit it.'
                    : 'Choose a type from the outline to add it to this page.'}
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
      {(autosave.storageWarning || autosave.state?.storageError) && (
        <p role="alert" className="request-error">
          {autosave.storageWarning ||
            'Local recovery is unavailable. Keep this tab open until all changes are saved.'}
        </p>
      )}
      {autosave.state?.message && (
        <p role="alert" className="request-error">
          {autosave.state.message}
        </p>
      )}
      {(conflict || status === 'blocked') && (
        <DraftRecovery
          loading={loading || saving}
          onReload={() => void loadSaved()}
        />
      )}
      {autosave.recoveries.length > 0 && (
        <section className="definition-checks" aria-label="Local recovery">
          <h2>Edits found on this device</h2>
          <p>
            Review a local copy before replacing your saved form. Older copies
            may need conflict review.
          </p>
          <ul className="local-recovery-list">
            {autosave.recoveries.map((record) => (
              <li key={record.editorId}>
                <button
                  className="local-recovery-button"
                  type="button"
                  disabled={saving || loading}
                  onClick={() => {
                    const recovered = recoverDraft(form, record.definition);
                    setRules(recovered.rules);
                    setActivePageId(record.definition.pages[0].id);
                    setSelected(
                      record.definition.pages[0].blocks[0]?.id || null,
                    );
                    void autosave.recover(record);
                  }}
                >
                  <span>
                    Recover local edit:{' '}
                    {record.definition.title || 'Untitled form'}
                  </span>
                  <time dateTime={new Date(record.updatedAt).toISOString()}>
                    Edited locally {new Date(record.updatedAt).toLocaleString()}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(backup || autosave.state?.record.backup) && (
        <button
          className="text-button"
          type="button"
          disabled={saving || loading}
          onClick={() => {
            const previous = backup || autosave.state?.record.backup;
            if (!previous) return;
            const { rules: previousRules } = recoverDraft(form, previous);
            setRules(previousRules);
            setActivePageId(previous.pages[0].id);
            setSelected(previous.pages[0].blocks[0]?.id || null);
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
