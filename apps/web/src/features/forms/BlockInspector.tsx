import { useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Block } from '@snapform/contracts/form';
import { useAccountUser } from '../auth/AccountLayout';
import { request } from './api';
import { uploadsAllowed } from './plan-features';
import { blockNames, insertOption, removeOption } from './new-form';
import { AnswerSettings } from './AnswerSettings';
// What the client will see in place of their answer, for every type that is
// not a list of options.
const answerHints: Partial<Record<Block['type'], string>> = {
  'short-text': 'Short answer',
  'long-text': 'Long answer',
  email: 'name@company.com',
  number: '0',
  date: 'Pick a date',
  acknowledgment: 'I agree',
  file: 'Upload files',
};
// Text areas fit what is typed, in every browser, and refit when their
// width changes (a narrower screen wraps the same words onto more lines).
function fit(element: HTMLTextAreaElement) {
  element.style.height = 'auto';
  element.style.height = element.scrollHeight + 'px';
}
function useGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (ref.current) fit(ref.current);
  }, [value]);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      fit(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}
const focusSoon = (id: string) =>
  requestAnimationFrame(() => document.getElementById(id)?.focus());
// The question is edited where the client will read it: the label is the
// heading, the description sits under it and options are typed in place.
export function BlockInspector({
  block,
  onChange,
  workspaceId,
}: {
  block: Block;
  onChange: (block: Block) => void;
  /** Absent before sign-up, when there is no plan to describe. */
  workspaceId?: string;
}) {
  const content = block.type === 'heading' || block.type === 'help';
  const text = content ? block.text : block.label;
  const label = useGrow(text);
  const description = useGrow(content ? '' : block.description);
  const focused = useRef('');
  useEffect(() => {
    // Focus the label once per question, not on every keystroke.
    if (focused.current === block.id) return;
    focused.current = block.id;
    label.current?.focus();
  }, [block.id, label]);
  const choice =
    block.type === 'single-choice' || block.type === 'multiple-choice'
      ? block
      : null;
  function addOption(afterId: string) {
    if (!choice) return;
    const next = insertOption(choice, afterId);
    if (!next) return;
    onChange(next.block);
    focusSoon(`option-${next.optionId}`);
  }
  function removeAt(optionId: string, focus = false) {
    if (!choice) return;
    const next = removeOption(choice, optionId);
    if (!next) return;
    onChange(next.block);
    if (focus) focusSoon(`option-${next.focusId}`);
  }
  // Enter leaves the heading for the next thing to write.
  function leaveLabel(event: KeyboardEvent) {
    if (block.type === 'help') return;
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!content) description.current?.focus();
  }
  return (
    <section className="block-inspector" aria-labelledby="inspector-title">
      <div className="inspector-bar">
        <h2 id="inspector-title">{blockNames[block.type]}</h2>
        {!content && (
          <label className="inspector-required">
            <input
              type="checkbox"
              role="switch"
              checked={block.required}
              onChange={(event) =>
                onChange({ ...block, required: event.target.checked })
              }
            />
            <span className="switch" aria-hidden="true" />
            Required
          </label>
        )}
      </div>
      <div
        className="question-card"
        data-kind={block.type === 'help' ? 'help' : content ? 'heading' : ''}
      >
        <label className="visually-hidden" htmlFor={`label-${block.id}`}>
          {content ? 'Text' : 'Question'}
        </label>
        <textarea
          ref={label}
          id={`label-${block.id}`}
          className="card-label"
          rows={1}
          maxLength={block.type === 'help' ? 10000 : 500}
          placeholder={
            block.type === 'help'
              ? 'Write a note for the client'
              : content
                ? 'Section heading'
                : 'Type your question'
          }
          value={text}
          onKeyDown={leaveLabel}
          onChange={(event) =>
            onChange(
              content
                ? { ...block, text: event.target.value }
                : { ...block, label: event.target.value },
            )
          }
        />
        {!content && (
          <>
            <label className="visually-hidden" htmlFor={`help-${block.id}`}>
              Description
            </label>
            <textarea
              ref={description}
              id={`help-${block.id}`}
              className="card-description"
              rows={1}
              maxLength={2000}
              placeholder="Add a description (optional)"
              value={block.description}
              onChange={(event) =>
                onChange({ ...block, description: event.target.value })
              }
            />
          </>
        )}
        {choice ? (
          <div className="card-options">
            {choice.options.map((option, index) => (
              <div className="card-option" key={option.id}>
                <span className="intake-key" aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
                <input
                  id={`option-${option.id}`}
                  aria-label={`Option ${index + 1}`}
                  placeholder={`Option ${index + 1}`}
                  maxLength={500}
                  value={option.label}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    // Enter adds the next option here instead of saving.
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addOption(option.id);
                    }
                    // Backspace in an empty option removes it.
                    if (event.key === 'Backspace' && !option.label) {
                      event.preventDefault();
                      removeAt(option.id, true);
                    }
                  }}
                  onChange={(event) =>
                    onChange({
                      ...choice,
                      options: choice.options.map((item) =>
                        item.id === option.id
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <button
                  className="card-option-remove"
                  type="button"
                  aria-label={`Remove option ${index + 1}`}
                  disabled={choice.options.length <= 1}
                  onClick={() => removeAt(option.id)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="card-option card-option-add"
              type="button"
              disabled={choice.options.length >= 20}
              onClick={() => addOption(choice.options.at(-1)?.id || '')}
            >
              <span className="intake-key" aria-hidden="true">
                +
              </span>
              Add option
            </button>
          </div>
        ) : (
          !content && (
            <p
              className="card-answer"
              data-type={block.type}
              aria-hidden="true"
            >
              {answerHints[block.type]}
            </p>
          )
        )}
      </div>
      <div className="inspector-foot">
        <AnswerSettings key={block.id} block={block} onChange={onChange} />
        {block.type === 'file' && workspaceId && (
          <FileQuestionNote workspaceId={workspaceId} />
        )}
      </div>
    </section>
  );
}
// Only Free owners need the upgrade note; until the plan is known, state the
// limits that apply to every plan.
function FileQuestionNote({ workspaceId }: { workspaceId: string }) {
  const user = useAccountUser();
  const plan = useQuery({
    queryKey: ['uploads', user.id, workspaceId],
    queryFn: ({ signal }) =>
      request(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/billing`,
        { signal },
        uploadsAllowed,
      ),
  });
  return (
    <p className="field-help">
      Files stay private, up to 25 MB each.
      {plan.data === false && (
        <>
          {' '}
          File upload questions need Pro.{' '}
          <a href="../billing">Plan and billing</a>
        </>
      )}
    </p>
  );
}
