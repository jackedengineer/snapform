import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Block } from '@snapform/contracts/form';
import { useAccountUser } from '../auth/AccountLayout';
import { request } from './api';
import { uploadsAllowed } from './plan-features';
import { blockNames, insertOption } from './new-form';
import { AnswerSettings } from './AnswerSettings';
export function BlockInspector({
  block,
  onChange,
  workspaceId,
}: {
  block: Block;
  onChange: (block: Block) => void;
  workspaceId: string;
}) {
  const labelInput = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEffect(() => labelInput.current?.focus(), [block.id]);
  const content = block.type === 'heading' || block.type === 'help';
  function addOption(afterId: string) {
    if (block.type !== 'single-choice' && block.type !== 'multiple-choice')
      return;
    const next = insertOption(block, afterId);
    if (!next) return;
    onChange(next.block);
    requestAnimationFrame(() =>
      document.getElementById(`option-${next.optionId}`)?.focus(),
    );
  }
  return (
    <section className="block-inspector" aria-labelledby="inspector-title">
      <h2 id="inspector-title">{blockNames[block.type]}</h2>
      <div className="field">
        <label htmlFor={`label-${block.id}`}>
          {content ? 'Text' : 'Question label'}
        </label>
        {block.type === 'help' ? (
          <textarea
            ref={(element) => {
              labelInput.current = element;
            }}
            id={`label-${block.id}`}
            maxLength={10000}
            rows={5}
            value={block.text}
            onChange={(event) =>
              onChange({ ...block, text: event.target.value })
            }
          />
        ) : (
          <input
            ref={(element) => {
              labelInput.current = element;
            }}
            id={`label-${block.id}`}
            maxLength={500}
            placeholder={content ? undefined : 'Type your question'}
            value={content ? block.text : block.label}
            onChange={(event) =>
              onChange(
                content
                  ? { ...block, text: event.target.value }
                  : { ...block, label: event.target.value },
              )
            }
          />
        )}
      </div>
      {!content && (
        <>
          <div className="field">
            <label htmlFor={`help-${block.id}`}>Helpful description</label>
            <textarea
              id={`help-${block.id}`}
              maxLength={2000}
              rows={3}
              value={block.description}
              onChange={(event) =>
                onChange({ ...block, description: event.target.value })
              }
            />
          </div>
          <label className="check-control">
            <input
              type="checkbox"
              checked={block.required}
              onChange={(event) =>
                onChange({ ...block, required: event.target.checked })
              }
            />
            An answer is required
          </label>
        </>
      )}
      {(block.type === 'single-choice' || block.type === 'multiple-choice') && (
        <div className="choice-editor">
          <h3>Options</h3>
          {block.options.map((option, index) => (
            <div className="choice-row" key={option.id}>
              <input
                id={`option-${option.id}`}
                aria-label={`Option ${index + 1}`}
                placeholder={`Option ${index + 1}`}
                maxLength={500}
                value={option.label}
                onKeyDown={(event) => {
                  // Enter adds the next option here instead of saving the form.
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing)
                    return;
                  event.preventDefault();
                  addOption(option.id);
                }}
                onChange={(event) =>
                  onChange({
                    ...block,
                    options: block.options.map((item) =>
                      item.id === option.id
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  })
                }
              />
              <button
                className="text-button"
                type="button"
                aria-label={`Remove option ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...block,
                    options: block.options.filter(
                      (item) => item.id !== option.id,
                    ),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="text-button"
            type="button"
            disabled={block.options.length >= 20}
            onClick={() => addOption(block.options.at(-1)?.id || '')}
          >
            + Add option
          </button>
        </div>
      )}
      <AnswerSettings key={block.id} block={block} onChange={onChange} />
      {block.type === 'file' && <FileQuestionNote workspaceId={workspaceId} />}
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
