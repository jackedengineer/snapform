import type { FormDefinition } from '@snapform/contracts/form';
import { addPage, canRemovePage, movePage, removePage } from './pages';
export function PageControls({
  definition,
  pageId,
  editable,
  onChange,
  onSelect,
}: {
  definition: FormDefinition;
  pageId: string;
  editable: boolean;
  onChange: (pages: FormDefinition['pages']) => void;
  onSelect: (id: string) => void;
}) {
  const index = definition.pages.findIndex((page) => page.id === pageId),
    page = definition.pages[index];
  if (!page) return null;
  function apply(next: FormDefinition | null) {
    if (!next) return;
    const trigger = document.activeElement;
    onChange(next.pages);
    requestAnimationFrame(() => {
      if (trigger instanceof HTMLButtonElement && trigger.disabled)
        document.getElementById('current-page')?.focus();
    });
  }
  return (
    <details className="page-controls">
      <summary>
        Pages{' '}
        <span>
          {index + 1} of {definition.pages.length}
        </span>
      </summary>
      <div className="page-control-fields">
        <div className="field">
          <label htmlFor="current-page">Current page</label>
          <select
            id="current-page"
            value={pageId}
            onChange={(event) => onSelect(event.target.value)}
          >
            {definition.pages.map((page, index) => (
              <option key={page.id} value={page.id}>
                {index + 1}. {page.title || 'Untitled page'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="page-title">Page title</label>
          <input
            id="page-title"
            maxLength={120}
            readOnly={!editable}
            value={page.title}
            onChange={(event) =>
              onChange(
                definition.pages.map((item) =>
                  item.id === pageId
                    ? { ...item, title: event.target.value }
                    : item,
                ),
              )
            }
          />
        </div>
      </div>
      {editable && (
        <>
          <div className="page-actions">
            <button
              className="text-button"
              type="button"
              disabled={definition.pages.length >= 10}
              onClick={() => {
                const next = addPage(definition);
                if (!next) return;
                apply(next);
                onSelect(next.pages.at(-1)!.id);
                requestAnimationFrame(() =>
                  document.getElementById('page-title')?.focus(),
                );
              }}
            >
              Add page +
            </button>
            <button
              className="text-button"
              type="button"
              disabled={index === 0}
              onClick={() => apply(movePage(definition, pageId, -1))}
            >
              Move page up ↑
            </button>
            <button
              className="text-button"
              type="button"
              disabled={index === definition.pages.length - 1}
              onClick={() => apply(movePage(definition, pageId, 1))}
            >
              Move page down ↓
            </button>
            <button
              className="text-button danger-text"
              type="button"
              disabled={!canRemovePage(definition, pageId)}
              onClick={() => {
                const next = removePage(definition, pageId);
                if (!next) return;
                apply(next);
                onSelect(next.pages[Math.min(index, next.pages.length - 1)].id);
              }}
            >
              Remove empty page
            </button>
          </div>
          <p className="field-help">
            Move questions and remove any routing references before removing a
            page. Reordering can change which rules are valid.
          </p>
        </>
      )}
    </details>
  );
}
