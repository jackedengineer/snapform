import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm, useStore } from '@tanstack/react-form';
import type { Block } from '@snapform/contracts/form';
import type { FormSnapshot } from '@snapform/contracts/draft';
import { can } from '@snapform/contracts/workspace';
import { useAccountUser } from '../auth/AccountLayout';
import { fetchForm } from './api';
import {
  PublicationControls,
  PublishAction,
  StatusChip,
  usePublication,
} from './PublicationControls';
import {
  preparePublication,
  publishingIssues,
  type PublishingIssue,
} from './prepare-publication';
import { useDraftAutosave } from './use-draft-autosave';
import {
  blockNames,
  newBlock,
  duplicateBlock,
  blockCaption,
  questionNumbers,
} from './new-form';
import { BlockInspector } from './BlockInspector';
import { DraftRecovery } from './DraftRecovery';
import { recoverDraft } from './recover-draft';
import { PageControls } from './PageControls';
import { FormSettings } from './FormSettings';
import { RuleControls } from './RuleControls';
import { moveBlockToPage } from './pages';
import { insertQuestion } from './insert-question';
import { DraftPreview } from './DraftPreview';
import './preview.css';
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
    staleTime: 1000,
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
  const [publishing, setPublishing] = useState(false);
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
  const [panel, setPanel] = useState<'build' | 'settings' | 'share'>('build');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [focusLink, setFocusLink] = useState(false);
  const [moveNote, setMoveNote] = useState('');
  const [emailOffer, setEmailOffer] = useState(false);
  useEffect(() => setMoveNote(''), [selected]);
  const linkFocused = useCallback(() => setFocusLink(false), []);
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
  const issues = publishingIssues(definition);
  const numbers = questionNumbers(definition);
  const publication = usePublication({
    workspaceId: snapshot.workspaceId,
    formId: snapshot.id,
    editable: editable && ready && !conflict && status !== 'blocked',
    revision,
    dirty,
    onBusy: setPublishing,
    prepare: () =>
      preparePublication({ ...form.state.values, rules }, autosave.flush, () =>
        fetchForm(snapshot.workspaceId, snapshot.id),
      ),
  });
  function showIssue({ targetId }: PublishingIssue) {
    const page = definition.pages.find((item) =>
      item.blocks.some((block) => block.id === targetId),
    );
    if (page && targetId) {
      setPanel('build');
      setActivePageId(page.id);
      setSelected(targetId);
      return;
    }
    setPanel('settings');
    requestAnimationFrame(() => {
      const summary = document.getElementById(`rule-${targetId}`);
      if (summary?.parentElement instanceof HTMLDetailsElement)
        summary.parentElement.open = true;
      summary?.focus();
    });
  }
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
  function add(type: Block['type']) {
    const next = newBlock(type);
    const updated = insertQuestion(
      { ...form.state.values, rules },
      activePage.id,
      selected,
      next,
    );
    if (!updated) return;
    form.setFieldValue('pages', updated.pages);
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
    if (selectedPage)
      setMoveNote(
        `Moved ${direction < 0 ? 'up' : 'down'} to position ${selectedIndex + direction + 1} of ${selectedPage.blocks.length}.`,
      );
    requestAnimationFrame(() => {
      if (trigger instanceof HTMLButtonElement && trigger.disabled)
        document.getElementById(`question-${block.id}`)?.focus();
    });
  }
  function moveToPage(pageId: string) {
    if (!block) return;
    const next = moveBlockToPage(definition, block.id, pageId);
    if (!next) return;
    const ruleIssues = (value: typeof definition) =>
      publishingIssues(value).filter(({ targetId }) =>
        value.rules.some((rule) => rule.id === targetId),
      ).length;
    const index = next.pages.findIndex((page) => page.id === pageId);
    form.setFieldValue('pages', next.pages);
    setActivePageId(pageId);
    setMoveNote(
      `Moved to ${next.pages[index].title || `page ${index + 1}`}.` +
        (ruleIssues(next) > ruleIssues(definition)
          ? ' A rule now needs attention. Review it in Publish & share.'
          : ''),
    );
  }
  function duplicate() {
    if (!block) return;
    const copy = duplicateBlock(block);
    const updated = insertQuestion(
      { ...form.state.values, rules },
      activePage.id,
      selected,
      copy,
    );
    if (!updated) return;
    form.setFieldValue('pages', updated.pages);
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
      <Link
        className="back-link responses-entry"
        to="/workspaces/$workspaceId/responses/$formId"
        params={{ workspaceId: snapshot.workspaceId, formId: snapshot.id }}
      >
        View responses →
      </Link>
      <fieldset disabled={publishing || loading || (editable && !ready)}>
        <div className="editor-header">
          <div>
            <p className="editor-context">Your form studio</p>
            <div className="editor-title-row">
              <form.Field name="title">
                {(field) => (
                  <textarea
                    className="form-title-input"
                    aria-label="Form title"
                    placeholder="Untitled form"
                    rows={1}
                    maxLength={120}
                    readOnly={!editable}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
              <StatusChip publication={publication} />
            </div>
            <p role="status" className="save-status" data-revision={revision}>
              {!ready && editable
                ? 'Preparing local recovery…'
                : saving
                  ? 'Saving…'
                  : conflict
                    ? 'This form changed elsewhere. Your edits are kept here.'
                    : status === 'blocked'
                      ? 'Saving paused. Review the message below.'
                      : status === 'offline'
                        ? autosave.state?.buffered
                          ? 'Saved on this device. Reconnect to sync.'
                          : 'Not saved yet. Keep this tab open.'
                        : dirty
                          ? 'Saving shortly…'
                          : 'All changes saved'}
            </p>
          </div>
          {editable && (
            <PublishAction
              publication={publication}
              issues={issues.length}
              save={
                conflict
                  ? 'conflict'
                  : status === 'blocked'
                    ? 'blocked'
                    : dirty
                      ? 'saving'
                      : 'saved'
              }
              onReview={() => {
                setPanel('share');
                requestAnimationFrame(() =>
                  document.getElementById('readiness-title')?.focus(),
                );
              }}
              onPublished={(first) => {
                if (!first) return;
                setPanel('share');
                setFocusLink(true);
                setEmailOffer(true);
              }}
            />
          )}
          {/* Keeps Enter in a field as "save now"; Publish is never a submit. */}
          {editable && (
            <button
              type="submit"
              hidden
              disabled={!dirty || conflict || saving || status === 'blocked'}
            >
              Save now
            </button>
          )}
        </div>
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
        <nav className="editor-navigation" aria-label="Editor views">
          {(['build', 'settings', 'share'] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-current={panel === view ? 'page' : undefined}
              onClick={() => setPanel(view)}
            >
              {
                {
                  build: 'Build',
                  settings: 'Settings',
                  share: 'Publish & share',
                }[view]
              }
            </button>
          ))}
          <button
            type="button"
            className="preview-trigger"
            onClick={() => setPreviewOpen(true)}
          >
            Preview
          </button>
        </nav>
        {previewOpen && (
          <DraftPreview
            definition={definition}
            onClose={() => setPreviewOpen(false)}
          />
        )}
        <div hidden={panel !== 'share'}>
          <PublicationControls
            publication={publication}
            issues={issues}
            focusLink={focusLink && panel === 'share'}
            onLinkFocused={linkFocused}
            onIssue={showIssue}
            emailOffer={emailOffer ? { owner: role === 'owner' } : null}
            onEmailOfferDone={() => setEmailOffer(false)}
          />
        </div>
        <div hidden={panel !== 'settings'}>
          <FormSettings
            definition={definition}
            editable={editable}
            onChange={(settings) => {
              form.setFieldValue('description', settings.description);
              form.setFieldValue('presentation', settings.presentation);
              form.setFieldValue('endings', settings.endings);
              form.setFieldValue('defaultEndingId', settings.defaultEndingId);
            }}
          />
          <RuleControls
            definition={definition}
            editable={editable}
            issues={issues}
            onChange={setRules}
          />
          <PageControls
            definition={definition}
            pageId={activePage.id}
            editable={editable}
            onChange={(pages) => form.setFieldValue('pages', pages)}
            onSelect={selectPage}
          />
        </div>
        <div hidden={panel !== 'build'}>
          <div className="editor-grid">
            <aside className="form-outline" aria-label="Form outline">
              <div className="outline-heading">
                <h2>Your questions</h2>
                <span>{blocks.length}</span>
              </div>
              {definition.pages.map((page) => (
                <div key={page.id}>
                  <h3 hidden={definition.pages.length === 1}>
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
                    {page.blocks.map((item) => (
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
                          <span>{numbers.get(item.id)}</span>
                          <span>{blockCaption(item)}</span>
                          <small>{blockNames[item.type]}</small>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              {editable && (
                <div className="add-block">
                  <h3>Add a question</h3>
                  <button
                    type="button"
                    className="question-picker-toggle"
                    aria-expanded={pickerOpen}
                    aria-controls="question-palette"
                    onClick={() => setPickerOpen(!pickerOpen)}
                  >
                    {pickerOpen ? 'Close question types' : '+ Add a question'}
                  </button>
                  <div
                    className="question-palette"
                    id="question-palette"
                    data-open={pickerOpen}
                  >
                    {Object.entries(blockNames)
                      .filter(([value]) => value !== 'file')
                      .map(([value, label]) => (
                        <button
                          type="button"
                          key={value}
                          disabled={
                            value === 'heading' || value === 'help'
                              ? blocks.length - answerCount >= 100
                              : answerCount >= 50
                          }
                          onClick={() => {
                            add(value as Block['type']);
                            setPickerOpen(false);
                          }}
                        >
                          <span aria-hidden="true">+</span>{' '}
                          {value === 'acknowledgment' ? 'Consent' : label}
                        </button>
                      ))}
                  </div>
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
                          <label htmlFor="move-question-page">
                            Move to page
                          </label>
                          <select
                            id="move-question-page"
                            value={selectedPage.id}
                            onChange={(event) => moveToPage(event.target.value)}
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
                        disabled={
                          'required' in block
                            ? answerCount >= 50
                            : blocks.length - answerCount >= 100
                        }
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
                      <p role="status" className="move-note">
                        {moveNote}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="editor-empty">
                  <h2>
                    {activePage.blocks.length
                      ? 'Choose a question to edit.'
                      : 'What would you like to ask?'}
                  </h2>
                  <p>
                    {activePage.blocks.length
                      ? 'Choose a question from the outline to edit it.'
                      : 'Choose Add a question, pick a type and start writing. Your changes save automatically.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </fieldset>
      {!editable && (
        <p className="request-error">
          Viewer access. Ask an owner or editor to make changes.
        </p>
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
    </form>
  );
}
