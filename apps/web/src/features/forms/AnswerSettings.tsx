import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supportedCurrencyCodes } from '@snapform/contracts/currency';
import type { Block } from '@snapform/contracts/form';
import { hasAnswerSettings, readAnswerSettings } from './answer-settings';
export function AnswerSettings({
  block,
  onChange,
}: {
  block: Block;
  onChange: (block: Block) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!hasAnswerSettings(block)) return null;
  return (
    <>
      <button
        type="button"
        className="text-button"
        onClick={() => setOpen(true)}
      >
        Answer settings
      </button>
      {open &&
        createPortal(
          <SettingsDialog
            block={block}
            onChange={onChange}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}
function SettingsDialog({
  block,
  onChange,
  onClose,
}: {
  block: Block;
  onChange: (block: Block) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState(
    block.type === 'number' ? block.unit.kind : 'none',
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const optionalBounds = block.type === 'number' || block.type === 'date';
  const text = block.type === 'short-text' || block.type === 'long-text';
  const choice = block.type === 'multiple-choice';
  const id = `settings-${block.id}`;
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const next = readAnswerSettings(
            block,
            new FormData(event.currentTarget),
          );
          if (!next) {
            setError('Check these settings and try again.');
            return;
          }
          onChange(next);
          dialog.current?.close();
        }}
      >
        <p className="eyebrow">SHAPE THE ANSWER</p>
        <h2 id={`${id}-title`}>Answer settings</h2>
        <p className="field-help">
          Apply these settings to your draft. You can review any conflicting
          limits before publishing.
        </p>
        {(text || choice) && (
          <div className="settings-pair">
            <div className="field">
              <label htmlFor={`${id}-min`}>
                {text ? 'Minimum characters' : 'Minimum selections'}
              </label>
              <input
                id={`${id}-min`}
                name={text ? 'minLength' : 'minSelections'}
                type="number"
                required
                min={0}
                max={text ? (block.type === 'short-text' ? 500 : 10000) : 20}
                step={1}
                defaultValue={
                  text ? block.minLength : choice ? block.minSelections : 0
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-max`}>
                {text ? 'Maximum characters' : 'Maximum selections'}
              </label>
              <input
                id={`${id}-max`}
                name={text ? 'maxLength' : 'maxSelections'}
                type="number"
                required
                min={1}
                max={text ? (block.type === 'short-text' ? 500 : 10000) : 20}
                step={1}
                defaultValue={
                  text ? block.maxLength : choice ? block.maxSelections : 1
                }
              />
            </div>
          </div>
        )}
        {optionalBounds && (
          <div className="settings-pair">
            <div className="field">
              <label htmlFor={`${id}-min`}>
                {block.type === 'date' ? 'Earliest date' : 'Minimum value'}
              </label>
              <input
                id={`${id}-min`}
                name="min"
                type={block.type === 'date' ? 'date' : 'number'}
                step={block.type === 'number' ? 'any' : undefined}
                min={
                  block.type === 'number' ? -Number.MAX_SAFE_INTEGER : undefined
                }
                max={
                  block.type === 'number' ? Number.MAX_SAFE_INTEGER : undefined
                }
                defaultValue={block.min ?? ''}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-max`}>
                {block.type === 'date' ? 'Latest date' : 'Maximum value'}
              </label>
              <input
                id={`${id}-max`}
                name="max"
                type={block.type === 'date' ? 'date' : 'number'}
                step={block.type === 'number' ? 'any' : undefined}
                min={
                  block.type === 'number' ? -Number.MAX_SAFE_INTEGER : undefined
                }
                max={
                  block.type === 'number' ? Number.MAX_SAFE_INTEGER : undefined
                }
                defaultValue={block.max ?? ''}
              />
            </div>
          </div>
        )}
        {block.type === 'number' && (
          <>
            <div className="field">
              <label htmlFor={`${id}-unit`}>Number unit</label>
              <select
                id={`${id}-unit`}
                name="unit"
                value={unit}
                onChange={(event) => {
                  const next = event.target.value;
                  if (
                    next === 'none' ||
                    next === 'percent' ||
                    next === 'currency' ||
                    next === 'custom'
                  )
                    setUnit(next);
                }}
              >
                <option value="none">No unit</option>
                <option value="percent">Percent (%)</option>
                <option value="currency">Currency</option>
                <option value="custom">Custom unit</option>
              </select>
            </div>
            {unit === 'currency' && (
              <div className="field">
                <label htmlFor={`${id}-currency`}>Currency</label>
                <select
                  id={`${id}-currency`}
                  name="currency"
                  defaultValue={
                    block.unit.kind === 'currency' ? block.unit.code : 'INR'
                  }
                >
                  {supportedCurrencyCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {unit === 'custom' && (
              <div className="field">
                <label htmlFor={`${id}-custom`}>Custom unit</label>
                <input
                  id={`${id}-custom`}
                  name="customUnit"
                  maxLength={32}
                  required
                  defaultValue={
                    block.unit.kind === 'custom' ? block.unit.label : ''
                  }
                  placeholder="e.g. hours / week"
                />
              </div>
            )}
          </>
        )}
        {block.type === 'file' && (
          <div className="field">
            <label htmlFor={`${id}-files`}>Maximum files</label>
            <select
              id={`${id}-files`}
              name="maxFiles"
              defaultValue={block.maxFiles}
            >
              {[1, 2, 3].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
            <p className="field-help">
              Files remain private. Upload checks and scanning are required
              before publication.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="request-error">
            {error}
          </p>
        )}
        <div className="settings-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button className="button primary" type="submit">
            Apply settings
          </button>
        </div>
      </form>
    </dialog>
  );
}
