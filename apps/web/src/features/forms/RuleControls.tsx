import { useId } from 'react';
import type { FormDefinition } from '@snapform/contracts/form';
import type { CompileIssue } from '@snapform/contracts/compile';
import type { Rule } from '@snapform/contracts/rules';
import { ConditionEditor } from './ConditionEditor';
import { addRule, moveRule, removeRule, ruleFields } from './rule-editing';
import { blockCaption } from './new-form';
function ReferenceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!options.some((option) => option.id === value) && (
          <option value={value}>Missing reference — choose another</option>
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
export function RuleControls({
  definition,
  editable,
  issues,
  onChange,
}: {
  definition: FormDefinition;
  editable: boolean;
  issues: CompileIssue[];
  onChange: (rules: Rule[]) => void;
}) {
  const fields = ruleFields(definition),
    rules = [...definition.rules].sort((a, b) => a.priority - b.priority);
  const pages = definition.pages.map((page, index) => ({
    id: page.id,
    label: `${index + 1}. ${page.title || 'Untitled page'}`,
  }));
  const fieldOptions = fields.map((field, index) => ({
    id: field.id,
    label: `${index + 1}. ${blockCaption(field)}`,
  }));
  function update(rule: Rule) {
    onChange(
      definition.rules.map((item) => (item.id === rule.id ? rule : item)),
    );
  }
  return (
    <details className="page-controls rule-controls">
      <summary>
        Conditional rules <span>{rules.length} of 30</span>
      </summary>
      <p className="field-help">
        Show questions conditionally or choose a forward path. At each page, the
        first matching navigation rule wins. Conditions can only use earlier
        available answers.
      </p>
      <p className="field-help">
        Changing a compared question or condition type starts a new comparison.
        Switching between all/any keeps its conditions.
      </p>
      {rules.map((rule, index) => {
        const action = rule.action;
        return (
          <details className="rule-card" key={rule.id}>
            <summary id={`rule-${rule.id}`}>
              Rule {index + 1} —{' '}
              {action.type === 'show'
                ? 'Show a question'
                : action.type === 'go-to'
                  ? 'Go to a page'
                  : 'Finish with a message'}
            </summary>
            <fieldset disabled={!editable}>
              <ConditionEditor
                fields={fields}
                condition={rule.condition}
                onChange={(condition) => update({ ...rule, condition })}
              />
              <div className="field">
                <label htmlFor={`action-${rule.id}`}>Then</label>
                <select
                  id={`action-${rule.id}`}
                  value={action.type}
                  onChange={(event) => {
                    if (!fields.length) return;
                    const type = event.target.value;
                    if (type === 'show')
                      update({
                        ...rule,
                        action: {
                          type,
                          fieldId: fields[1]?.id || fields[0].id,
                        },
                      });
                    if (type === 'go-to' && definition.pages[1])
                      update({
                        ...rule,
                        action: {
                          type,
                          fromPageId: definition.pages[0].id,
                          pageId: definition.pages[1].id,
                        },
                      });
                    if (type === 'end')
                      update({
                        ...rule,
                        action: {
                          type,
                          fromPageId: definition.pages[0].id,
                          endingId: definition.defaultEndingId,
                        },
                      });
                  }}
                >
                  <option value="show">Show a question</option>
                  <option value="go-to" disabled={definition.pages.length < 2}>
                    Go to a later page
                  </option>
                  <option value="end">Finish with a message</option>
                </select>
              </div>
              {action.type === 'show' ? (
                <ReferenceSelect
                  label="Question to show"
                  value={action.fieldId}
                  options={fieldOptions}
                  onChange={(fieldId) =>
                    update({ ...rule, action: { ...action, fieldId } })
                  }
                />
              ) : (
                <>
                  <ReferenceSelect
                    label="After page"
                    value={action.fromPageId}
                    options={pages}
                    onChange={(fromPageId) =>
                      update({ ...rule, action: { ...action, fromPageId } })
                    }
                  />
                  {action.type === 'go-to' ? (
                    <ReferenceSelect
                      label="Destination page"
                      value={action.pageId}
                      options={pages}
                      onChange={(pageId) =>
                        update({ ...rule, action: { ...action, pageId } })
                      }
                    />
                  ) : (
                    <ReferenceSelect
                      label="Completion message"
                      value={action.endingId}
                      options={definition.endings.map((ending, index) => ({
                        id: ending.id,
                        label: `${index + 1}. ${ending.title || 'Untitled message'}`,
                      }))}
                      onChange={(endingId) =>
                        update({ ...rule, action: { ...action, endingId } })
                      }
                    />
                  )}
                </>
              )}
              <div className="page-actions">
                {([-1, 1] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    className="text-button"
                    disabled={
                      direction === -1
                        ? index === 0
                        : index === rules.length - 1
                    }
                    onClick={() => {
                      const next = moveRule(definition, rule.id, direction);
                      if (next) onChange(next.rules);
                      requestAnimationFrame(() =>
                        document.getElementById(`rule-${rule.id}`)?.focus(),
                      );
                    }}
                  >
                    {direction === -1 ? 'Move rule up ↑' : 'Move rule down ↓'}
                  </button>
                ))}
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => {
                    onChange(removeRule(definition, rule.id).rules);
                    requestAnimationFrame(() =>
                      document.getElementById('add-rule')?.focus(),
                    );
                  }}
                >
                  Remove rule
                </button>
              </div>
            </fieldset>
            {issues
              .filter((issue) => issue.targetId === rule.id)
              .map((issue, index) => (
                <p key={index} className="request-error">
                  {issue.message}
                </p>
              ))}
          </details>
        );
      })}
      {editable && (
        <button
          id="add-rule"
          type="button"
          className="text-button"
          disabled={!fields.length || rules.length >= 30}
          onClick={() => {
            const next = addRule(definition);
            if (!next) return;
            onChange(next.rules);
            requestAnimationFrame(() => {
              const summary = document.getElementById(
                `rule-${next.rules.at(-1)!.id}`,
              );
              if (summary?.parentElement instanceof HTMLDetailsElement)
                summary.parentElement.open = true;
              summary?.focus();
            });
          }}
        >
          Add rule +
        </button>
      )}
      {!fields.length && (
        <p className="field-help">Add an answer question to create a rule.</p>
      )}
    </details>
  );
}
