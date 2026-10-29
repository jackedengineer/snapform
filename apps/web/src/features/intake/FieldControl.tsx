import type { Block } from '@snapform/contracts/form';
import type { Answer } from '@snapform/contracts/answers';
export function FieldControl({
  block,
  answer,
  error,
  onChange,
  onBlur,
}: {
  block: Block;
  answer?: Answer;
  error?: string;
  onChange: (answer: Answer) => void;
  onBlur: () => void;
}) {
  if (block.type === 'heading')
    return <h3 className="intake-section-heading">{block.text}</h3>;
  if (block.type === 'help') return <p className="intake-help">{block.text}</p>;
  const id = 'answer-' + block.id,
    help = id + '-help',
    issue = id + '-error';
  const value = answer?.state === 'value' ? answer.value : undefined;
  const text =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const unit =
    block.type === 'number'
      ? block.unit.kind === 'currency'
        ? block.unit.code
        : block.unit.kind === 'percent'
          ? '%'
          : block.unit.kind === 'custom'
            ? block.unit.label
            : ''
      : '';
  const change = (text: string) =>
    onChange(
      text === '' ? { state: 'blank' } : { state: 'value', value: text },
    );
  const common = {
    id,
    'aria-describedby':
      [
        block.description ? help : '',
        error ? issue : '',
        unit ? id + '-unit' : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined,
    'aria-invalid': Boolean(error),
    'aria-required': block.required,
    onBlur,
  };
  const title = (
    <>
      {block.label}
      {block.required && <span className="intake-required"> Required</span>}
    </>
  );
  let control;
  switch (block.type) {
    case 'short-text':
      control = (
        <input
          {...common}
          type="text"
          value={text}
          maxLength={block.maxLength}
          onChange={(event) => change(event.target.value)}
          autoComplete="off"
        />
      );
      break;
    case 'long-text':
      control = (
        <textarea
          {...common}
          value={text}
          maxLength={block.maxLength}
          rows={5}
          onChange={(event) => change(event.target.value)}
        />
      );
      break;
    case 'email':
      control = (
        <input
          {...common}
          type="email"
          autoComplete="email"
          maxLength={254}
          value={text}
          onChange={(event) => change(event.target.value)}
        />
      );
      break;
    case 'number':
      control = (
        <>
          <input
            {...common}
            type="text"
            inputMode="decimal"
            maxLength={40}
            value={text}
            onChange={(event) => change(event.target.value)}
          />
          {unit && (
            <span id={id + '-unit'} className="intake-unit">
              {unit}
            </span>
          )}
        </>
      );
      break;
    case 'date':
      control = (
        <input
          {...common}
          type="date"
          min={block.min}
          max={block.max}
          value={text}
          onInput={(event) => change(event.currentTarget.value)}
        />
      );
      break;
    case 'single-choice':
    case 'multiple-choice': {
      const selected = Array.isArray(value) ? value : [];
      control = (
        <div className="intake-options">
          {block.options.map((option) => (
            <label className="intake-option" key={option.id}>
              <input
                type={block.type === 'single-choice' ? 'radio' : 'checkbox'}
                name={id}
                value={option.id}
                checked={
                  block.type === 'single-choice'
                    ? value === option.id
                    : selected.includes(option.id)
                }
                aria-describedby={common['aria-describedby']}
                onBlur={onBlur}
                onChange={(event) =>
                  onChange({
                    state: 'value',
                    value:
                      block.type === 'single-choice'
                        ? option.id
                        : event.target.checked
                          ? [...selected, option.id]
                          : selected.filter((id) => id !== option.id),
                  })
                }
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'acknowledgment':
      control = (
        <label className="intake-option">
          <input
            {...common}
            type="checkbox"
            checked={value === true}
            onChange={(event) =>
              onChange({ state: 'value', value: event.target.checked })
            }
          />
          <span>I agree</span>
        </label>
      );
      break;
    case 'file':
      control = (
        <p>File collection is unavailable. Contact the business for help.</p>
      );
      break;
  }
  const choices =
    block.type === 'single-choice' || block.type === 'multiple-choice';
  const body = (
    <>
      {block.description && (
        <p id={help} className="intake-help">
          {block.description}
        </p>
      )}
      {control}
      {error && (
        <p id={issue} className="intake-field-error">
          {error}
        </p>
      )}
      {!block.required && (
        <button
          type="button"
          className="intake-text-button"
          onClick={() => onChange({ state: 'refused' })}
        >
          {answer?.state === 'refused'
            ? 'Marked as prefer not to answer'
            : 'Prefer not to answer'}
        </button>
      )}
    </>
  );
  return choices ? (
    <fieldset
      id={id}
      tabIndex={-1}
      className="intake-field"
      aria-invalid={Boolean(error)}
    >
      <legend>{title}</legend>
      {body}
    </fieldset>
  ) : (
    <div className="intake-field">
      <label htmlFor={id}>{title}</label>
      {body}
    </div>
  );
}
