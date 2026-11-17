import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { Block } from '@snapform/contracts/form';
import { BlockInspector } from '../forms/BlockInspector';
import { DraftPreview } from '../forms/DraftPreview';
import { insertQuestion } from '../forms/insert-question';
import {
  blockCaption,
  blockNames,
  newBlock,
  questionNumbers,
} from '../forms/new-form';
import { publishingIssues } from '../forms/prepare-publication';
import { starters } from '../forms/starters';
import {
  guestDraftKey,
  newGuestDraft,
  readGuestDraft,
  type GuestDraft,
} from './guest-draft';
import './start.css';

// Browser storage can be missing or full; building still works without it.
function load() {
  try {
    return readGuestDraft(localStorage.getItem(guestDraftKey), Date.now());
  } catch {
    return null;
  }
}
function save(draft: GuestDraft | null) {
  try {
    if (draft) localStorage.setItem(guestDraftKey, JSON.stringify(draft));
    else localStorage.removeItem(guestDraftKey);
    return true;
  } catch {
    return false;
  }
}
// File questions need a plan, so they wait until there is an account.
const addable = (Object.keys(blockNames) as Block['type'][]).filter(
  (type) => type !== 'file',
);

function Frame({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="start-shell">
      <header className="start-bar">
        <Link to="/" className="wordmark" aria-label="Snapform home">
          snapform
          <span className="wordmark-caret" aria-hidden="true" />
        </Link>
        <div className="start-actions">{actions}</div>
      </header>
      <main id="main" className="start-main">
        {children}
      </main>
    </div>
  );
}

export function GuestStart() {
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState(true);
  useEffect(() => {
    setDraft(load());
    setLoaded(true);
  }, []);
  function change(next: GuestDraft | null) {
    const value = next && { ...next, updatedAt: Date.now() };
    setDraft(value);
    setStored(save(value));
  }
  if (!loaded)
    return (
      <Frame>
        <p role="status">Opening…</p>
      </Frame>
    );
  if (!draft)
    return (
      <Frame
        actions={
          <Link to="/login" className="landing-signin">
            Sign in
          </Link>
        }
      >
        <section className="start-picker" aria-labelledby="start-title">
          <h1 id="start-title">What do you want to ask clients?</h1>
          <p className="start-lede">
            Pick a starting point. Every question is yours to change, and you
            only need an account to publish.
          </p>
          <div className="start-options">
            {starters.map((starter) => (
              <button
                key={starter.id}
                type="button"
                className="start-option"
                onClick={() => change(newGuestDraft(starter.id, Date.now()))}
              >
                <strong>{starter.title}</strong>
                <span>{starter.description}</span>
              </button>
            ))}
            <button
              type="button"
              className="start-option start-option-blank"
              onClick={() => change(newGuestDraft('blank', Date.now()))}
            >
              <strong>Blank form</strong>
              <span>Start with an empty page.</span>
            </button>
          </div>
        </section>
      </Frame>
    );
  return (
    <GuestEditor
      key={draft.formId}
      draft={draft}
      stored={stored}
      onChange={change}
    />
  );
}

function GuestEditor({
  draft,
  stored,
  onChange,
}: {
  draft: GuestDraft;
  stored: boolean;
  onChange: (draft: GuestDraft | null) => void;
}) {
  const navigate = useNavigate();
  const { definition } = draft;
  const blocks = definition.pages.flatMap((page) => page.blocks);
  const [selected, setSelected] = useState<string | null>(
    blocks[0]?.id ?? null,
  );
  const [adding, setAdding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [resetting, setResetting] = useState(false);
  const numbers = questionNumbers(definition);
  const block = blocks.find((item) => item.id === selected);
  const page =
    definition.pages.find((item) =>
      item.blocks.some((entry) => entry.id === selected),
    ) ?? definition.pages[0];
  const update = (next: Block) =>
    onChange({
      ...draft,
      definition: {
        ...definition,
        pages: definition.pages.map((item) => ({
          ...item,
          blocks: item.blocks.map((entry) =>
            entry.id === next.id ? next : entry,
          ),
        })),
      },
    });
  function add(type: Block['type']) {
    const next = newBlock(type);
    const inserted = insertQuestion(definition, page.id, selected, next);
    if (!inserted) return;
    onChange({ ...draft, definition: inserted });
    setSelected(next.id);
    setAdding(false);
  }
  function remove(id: string) {
    const index = blocks.findIndex((item) => item.id === id);
    onChange({
      ...draft,
      definition: {
        ...definition,
        pages: definition.pages.map((item) => ({
          ...item,
          blocks: item.blocks.filter((entry) => entry.id !== id),
        })),
      },
    });
    setSelected(blocks[index + 1]?.id ?? blocks[index - 1]?.id ?? null);
  }
  function publish() {
    const found = [
      ...(definition.title.trim() ? [] : ['Give the form a title.']),
      ...([...draft.business.trim()].length >= 2
        ? []
        : ['Add your business name. Clients see it on the form.']),
      ...publishingIssues(definition).map((issue) => issue.message),
    ];
    setProblems(found);
    if (found.length) {
      requestAnimationFrame(() =>
        document.getElementById('start-problems')?.focus(),
      );
      return;
    }
    void navigate({ to: '/signup' });
  }
  return (
    <Frame
      actions={
        <>
          <span className="start-saved" role="status">
            {stored ? 'Saved on this device' : 'Not saved: keep this tab open'}
          </span>
          <button
            type="button"
            className="button secondary compact-button"
            onClick={() => setPreviewing(true)}
          >
            Preview
          </button>
          <button
            type="button"
            className="button primary compact-button"
            onClick={publish}
          >
            Publish
          </button>
        </>
      }
    >
      <div className="start-head">
        <label className="visually-hidden" htmlFor="start-form-title">
          Form title
        </label>
        <input
          id="start-form-title"
          className="start-title"
          maxLength={120}
          placeholder="Form title"
          value={definition.title}
          onChange={(event) =>
            onChange({
              ...draft,
              definition: { ...definition, title: event.target.value },
            })
          }
        />
        <div className="start-business">
          <label htmlFor="start-business">Business name</label>
          <input
            id="start-business"
            maxLength={80}
            placeholder="Northwind Studio"
            aria-describedby="start-business-help"
            value={draft.business}
            onChange={(event) =>
              onChange({ ...draft, business: event.target.value })
            }
          />
          <p id="start-business-help">Clients see this on your form.</p>
        </div>
      </div>
      {problems.length > 0 && (
        <div
          id="start-problems"
          className="start-problems"
          role="alert"
          tabIndex={-1}
        >
          <p>Before you publish:</p>
          <ul>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="start-grid">
        <nav className="start-outline" aria-label="Questions">
          <ol>
            {blocks.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={selected === item.id}
                  onClick={() => setSelected(item.id)}
                >
                  <span aria-hidden="true">{numbers.get(item.id) ?? '·'}</span>
                  <span>{blockCaption(item) || blockNames[item.type]}</span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="start-add"
            aria-expanded={adding}
            aria-controls="start-types"
            onClick={() => setAdding(!adding)}
          >
            {adding ? 'Close' : '+ Add a question'}
          </button>
          <div id="start-types" className="start-types" hidden={!adding}>
            {addable.map((type) => (
              <button key={type} type="button" onClick={() => add(type)}>
                {type === 'acknowledgment' ? 'Consent' : blockNames[type]}
              </button>
            ))}
          </div>
        </nav>
        <div className="editor-canvas start-canvas">
          {block ? (
            <>
              <BlockInspector block={block} onChange={update} />
              <div className="block-actions">
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => remove(block.id)}
                >
                  Remove question
                </button>
              </div>
            </>
          ) : (
            <div className="editor-empty">
              <h2>What would you like to ask?</h2>
              <p>Choose Add a question to write the first one.</p>
            </div>
          )}
        </div>
      </div>
      <div className="start-reset">
        {resetting ? (
          <>
            <p role="alert">This form is only on this device. Discard it?</p>
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => onChange(null)}
            >
              Discard and start over
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setResetting(false)}
            >
              Keep editing
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-button"
            onClick={() => setResetting(true)}
          >
            Start over with a different form
          </button>
        )}
      </div>
      {previewing && (
        <DraftPreview
          definition={definition}
          onClose={() => setPreviewing(false)}
        />
      )}
    </Frame>
  );
}
