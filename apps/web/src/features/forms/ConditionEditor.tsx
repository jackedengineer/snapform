import { useId } from 'react';
import type { Field } from '@snapform/contracts/form';
import type { Condition } from '@snapform/contracts/rules';
import { operatorsFor, predicateFor } from './rule-editing';
import { blockCaption } from './new-form';
const labels: Record<Condition['op'], string> = {
  answered: 'Has an answer',
  unanswered: 'Has no answer',
  eq: 'Equals',
  neq: 'Does not equal',
  gt: 'Is greater than',
  gte: 'Is at least',
  lt: 'Is less than',
  lte: 'Is at most',
  contains: 'Includes choice',
  and: 'All conditions',
  or: 'Any condition',
  not: 'Not this condition',
};
export function ConditionEditor({
  condition,
  fields,
  onChange,
  depth = 1,
}: {
  condition: Condition;
  fields: Field[];
  onChange: (condition: Condition) => void;
  depth?: number;
}) {
  const id = useId();
  function focusChild(index: number) {
    requestAnimationFrame(() => {
      const input = document
        .getElementById(id)
        ?.querySelectorAll(':scope > .condition-child')
        .item(index)
        ?.querySelector('select');
      if (input instanceof HTMLSelectElement) input.focus();
    });
  }
  const field =
    ('fieldId' in condition &&
      fields.find((field) => field.id === condition.fieldId)) ||
    fields[0];
  if (!field)
    return (
      <p className="field-help">
        Add an answer question before editing this condition.
      </p>
    );
  const group = condition.op === 'and' || condition.op === 'or';
  const operators: Condition['op'][] = [
    ...operatorsFor(field),
    ...(depth < 4 ? (['and', 'or', 'not'] as const) : []),
  ];
  return (
    <fieldset id={id} className="condition-editor">
      <legend>{depth === 1 ? 'When' : 'Condition'}</legend>
      <div className="field">
        <label htmlFor={`${id}-type`}>Condition type</label>
        <select
          id={`${id}-type`}
          value={condition.op}
          onChange={(event) => {
            const op = event.target.value;
            if (op === 'and' || op === 'or')
              onChange({
                op,
                conditions: group
                  ? condition.conditions
                  : [predicateFor(field, 'answered')],
              });
            else if (op === 'not')
              onChange({ op, condition: predicateFor(field, 'answered') });
            else {
              const valid = operatorsFor(field).find(
                (candidate) => candidate === op,
              );
              if (valid) onChange(predicateFor(field, valid));
            }
          }}
        >
          {!operators.includes(condition.op) && (
            <option value={condition.op}>
              {labels[condition.op]} — review this comparison
            </option>
          )}
          {operators.map((op) => (
            <option key={op} value={op}>
              {labels[op]}
            </option>
          ))}
        </select>
      </div>
      {group ? (
        <>
          {condition.conditions.map((child, index) => (
            <div key={index} className="condition-child">
              <ConditionEditor
                condition={child}
                fields={fields}
                depth={depth + 1}
                onChange={(next) =>
                  onChange({
                    ...condition,
                    conditions: condition.conditions.map((item, i) =>
                      i === index ? next : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="text-button danger-text"
                disabled={condition.conditions.length <= 1}
                onClick={() => {
                  onChange({
                    ...condition,
                    conditions: condition.conditions.filter(
                      (_, i) => i !== index,
                    ),
                  });
                  focusChild(Math.min(index, condition.conditions.length - 2));
                }}
              >
                Remove condition {index + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            disabled={condition.conditions.length >= 8}
            onClick={() => {
              onChange({
                ...condition,
                conditions: [
                  ...condition.conditions,
                  predicateFor(field, 'answered'),
                ],
              });
              focusChild(condition.conditions.length);
            }}
          >
            Add condition +
          </button>
        </>
      ) : condition.op === 'not' ? (
        <ConditionEditor
          condition={condition.condition}
          fields={fields}
          depth={depth + 1}
          onChange={(next) => onChange({ ...condition, condition: next })}
        />
      ) : (
        <>
          <div className="field">
            <label htmlFor={`${id}-field`}>Answer to compare</label>
            <select
              id={`${id}-field`}
              value={condition.fieldId}
              onChange={(event) => {
                const next = fields.find(
                  (field) => field.id === event.target.value,
                );
                if (next) onChange(predicateFor(next, condition.op));
              }}
            >
              {!fields.some((field) => field.id === condition.fieldId) && (
                <option value={condition.fieldId}>
                  Missing question — choose another
                </option>
              )}
              {fields.map((field, index) => (
                <option key={field.id} value={field.id}>
                  {index + 1}. {blockCaption(field)}
                </option>
              ))}
            </select>
          </div>
          {condition.op === 'contains' ||
          ('value' in condition && field.type === 'single-choice') ? (
            <div className="field">
              <label htmlFor={`${id}-value`}>Choice</label>
              <select
                id={`${id}-value`}
                value={
                  condition.op === 'contains'
                    ? condition.optionId
                    : String(condition.value)
                }
                onChange={(event) =>
                  onChange(
                    condition.op === 'contains'
                      ? { ...condition, optionId: event.target.value }
                      : { ...condition, value: event.target.value },
                  )
                }
              >
                <option value="" disabled>
                  Choose an available option
                </option>
                {'options' in field &&
                  field.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label || 'Untitled option'}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            'value' in condition && (
              <div className="field">
                <label htmlFor={`${id}-value`}>Comparison value</label>
                {field.type === 'acknowledgment' ? (
                  <select
                    id={`${id}-value`}
                    value={String(condition.value)}
                    onChange={(event) =>
                      onChange({
                        ...condition,
                        value: event.target.value === 'true',
                      })
                    }
                  >
                    <option value="true">Accepted</option>
                    <option value="false">Not accepted</option>
                  </select>
                ) : (
                  <input
                    id={`${id}-value`}
                    type={
                      field.type === 'number'
                        ? 'number'
                        : field.type === 'date'
                          ? 'date'
                          : 'text'
                    }
                    step={field.type === 'number' ? 'any' : undefined}
                    maxLength={10000}
                    value={String(condition.value)}
                    onChange={(event) =>
                      onChange({
                        ...condition,
                        value:
                          field.type === 'number' && event.target.value !== ''
                            ? Number(event.target.value)
                            : event.target.value,
                      })
                    }
                  />
                )}
              </div>
            )
          )}
        </>
      )}
    </fieldset>
  );
}
