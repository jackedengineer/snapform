import { useEffect, useRef } from 'react';
import type { Block } from '@snapform/contracts/form';
import { blockNames } from './new-form';
import { AnswerSettings } from './AnswerSettings';
export function BlockInspector({
  block,
  onChange,
}: {
  block: Block;
  onChange: (block: Block) => void;
}) {
  const labelInput = useRef<HTMLInputElement>(null);
  useEffect(() => labelInput.current?.focus(), [block.id]);
  const content = block.type === 'heading' || block.type === 'help';
  return (
    <section className="block-inspector" aria-labelledby="inspector-title">
      <p className="eyebrow">MAKE IT YOURS</p>
      <h2 id="inspector-title">{blockNames[block.type]}</h2>
      <div className="field">
        <label htmlFor={`label-${block.id}`}>
          {content ? 'Text' : 'Question label'}
        </label>
        <input
          ref={labelInput}
          id={`label-${block.id}`}
          maxLength={content && block.type === 'help' ? 10000 : 500}
          value={content ? block.text : block.label}
          onChange={(event) =>
            onChange(
              content
                ? { ...block, text: event.target.value }
                : { ...block, label: event.target.value },
            )
          }
        />
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
                aria-label={`Option ${index + 1}`}
                maxLength={500}
                value={option.label}
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
            onClick={() =>
              onChange({
                ...block,
                options: [
                  ...block.options,
                  {
                    id: crypto.randomUUID(),
                    label: `Option ${block.options.length + 1}`,
                  },
                ],
              })
            }
          >
            + Add option
          </button>
        </div>
      )}
      <AnswerSettings key={block.id} block={block} onChange={onChange} />
      {block.type === 'file' && (
        <p className="field-help">
          Files stay private and require validation and scanning before they can
          be used. AI reading is disabled.
        </p>
      )}
    </section>
  );
}
