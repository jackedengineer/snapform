import { useState } from 'react';
import type { FormDefinition } from '@snapform/contracts/form';
import { addEnding, canRemoveEnding, removeEnding } from './endings';
type Settings = Pick<
  FormDefinition,
  'description' | 'presentation' | 'endings' | 'defaultEndingId'
>;
export function FormSettings({
  definition,
  editable,
  onChange,
}: {
  definition: FormDefinition;
  editable: boolean;
  onChange: (settings: Settings) => void;
}) {
  const [selectedId, setSelectedId] = useState(definition.defaultEndingId);
  const ending =
    definition.endings.find((item) => item.id === selectedId) ||
    definition.endings[0];
  function updateEnding(patch: Partial<typeof ending>) {
    onChange({
      ...definition,
      endings: definition.endings.map((item) =>
        item.id === ending.id ? { ...item, ...patch } : item,
      ),
    });
  }
  return (
    <details className="page-controls form-settings">
      <summary>Form settings & completion</summary>
      <div className="field">
        <label htmlFor="form-description">Form description</label>
        <textarea
          id="form-description"
          rows={3}
          maxLength={2000}
          readOnly={!editable}
          value={definition.description}
          onChange={(event) =>
            onChange({ ...definition, description: event.target.value })
          }
        />
      </div>
      <div className="field">
        <label htmlFor="form-presentation">Presentation</label>
        <select
          id="form-presentation"
          disabled={!editable}
          value={definition.presentation}
          onChange={(event) => {
            const presentation = event.target.value;
            if (presentation === 'page' || presentation === 'card')
              onChange({ ...definition, presentation });
          }}
        >
          <option value="page">Questions together on each page</option>
          <option value="card">One question at a time</option>
        </select>
      </div>
      <h2>Completion messages</h2>
      <p className="field-help">
        Shown after a response is saved. Use the default unless a routing rule
        selects another message.
      </p>
      <div className="field">
        <label htmlFor="current-ending">Completion message</label>
        <select
          id="current-ending"
          value={ending.id}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {definition.endings.map((item, index) => (
            <option key={item.id} value={item.id}>
              {index + 1}. {item.title.slice(0, 80) || 'Untitled message'}
              {item.id === definition.defaultEndingId ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ending-title">Message title</label>
        <input
          id="ending-title"
          maxLength={500}
          readOnly={!editable}
          value={ending.title}
          onChange={(event) => updateEnding({ title: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="ending-description">Message description</label>
        <textarea
          id="ending-description"
          rows={3}
          maxLength={2000}
          readOnly={!editable}
          value={ending.description}
          onChange={(event) =>
            updateEnding({ description: event.target.value })
          }
        />
      </div>
      {editable && (
        <div className="page-actions">
          <button
            className="text-button"
            type="button"
            disabled={ending.id === definition.defaultEndingId}
            onClick={() => {
              onChange({ ...definition, defaultEndingId: ending.id });
              requestAnimationFrame(() =>
                document.getElementById('current-ending')?.focus(),
              );
            }}
          >
            Use as default
          </button>
          <button
            className="text-button"
            type="button"
            disabled={definition.endings.length >= 10}
            onClick={() => {
              const next = addEnding(definition);
              if (!next) return;
              onChange(next);
              setSelectedId(next.endings.at(-1)!.id);
              requestAnimationFrame(() =>
                document.getElementById('ending-title')?.focus(),
              );
            }}
          >
            Add completion message +
          </button>
          <button
            className="text-button danger-text"
            type="button"
            disabled={!canRemoveEnding(definition, ending.id)}
            onClick={() => {
              const next = removeEnding(definition, ending.id);
              if (!next) return;
              onChange(next);
              setSelectedId(next.defaultEndingId);
              requestAnimationFrame(() =>
                document.getElementById('current-ending')?.focus(),
              );
            }}
          >
            Remove message
          </button>
        </div>
      )}
      <p className="field-help">
        Up to ten messages. Choose another default and remove routing references
        before removing a message.
      </p>
    </details>
  );
}
