import { useId, useState } from 'react';
import type { FormDefinition } from '@snapform/contracts/form';
import type { Rule } from '@snapform/contracts/rules';
import { ConditionEditor } from './ConditionEditor';
import {
  appendRule,
  conditionFields,
  draftRule,
  emptyRuleDraft,
  laterPages,
  moveRule,
  operatorLabels,
  operatorsFor,
  removeRule,
  ruleFields,
  showTargets,
  type RuleDraft,
} from './rule-editing';
import { blockCaption, questionNumbers } from './new-form';
import type { PublishingIssue } from './prepare-publication';
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
          <option value={value}>Missing. Choose another.</option>
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
  issues: PublishingIssue[];
  onChange: (rules: Rule[]) => void;
}) {
  const fields = ruleFields(definition),
    rules = [...definition.rules].sort((a, b) => a.priority - b.priority);
  const pages = definition.pages.map((page, index) => ({
    id: page.id,
    label: `${index + 1}. ${page.title || 'Untitled page'}`,
  }));
  const numbers = questionNumbers(definition);
  const fieldLabel = (field: (typeof fields)[number]) =>
    `${numbers.get(field.id)}. ${blockCaption(field)}`;
  const [draft, setDraft] = useState<RuleDraft | null>(null);
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
              Rule {index + 1}:{' '}
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
                    const target = showTargets(
                      definition,
                      conditionFields(rule.condition),
                      rule.id,
                    )[0];
                    if (type === 'show' && target)
                      update({
                        ...rule,
                        action: { type, fieldId: target.id },
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
                  options={fields
                    .filter(
                      (field) =>
                        field.id === action.fieldId ||
                        showTargets(
                          definition,
                          conditionFields(rule.condition),
                          rule.id,
                        ).includes(field),
                    )
                    .map((field) => ({
                      id: field.id,
                      label: fieldLabel(field),
                    }))}
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
                      options={pages.filter(
                        (_, index) =>
                          index >
                          definition.pages.findIndex(
                            (page) => page.id === action.fromPageId,
                          ),
                      )}
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
      {editable && draft && (
        <RuleDraftCard
          definition={definition}
          draft={draft}
          fieldLabel={fieldLabel}
          onChange={setDraft}
          onCancel={() => {
            setDraft(null);
            requestAnimationFrame(() =>
              document.getElementById('add-rule')?.focus(),
            );
          }}
          onAdd={(rule) => {
            const next = appendRule(definition, rule);
            if (!next) return;
            onChange(next.rules);
            setDraft(null);
            requestAnimationFrame(() =>
              document.getElementById(`rule-${rule.id}`)?.focus(),
            );
          }}
        />
      )}
      {editable && !draft && (
        <button
          id="add-rule"
          type="button"
          className="text-button"
          disabled={!fields.length || rules.length >= 30}
          onClick={() => {
            setDraft(emptyRuleDraft);
            requestAnimationFrame(() =>
              document.getElementById('draft-rule-field')?.focus(),
            );
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

// A new rule stays here, outside the form, until every part is chosen.
function RuleDraftCard({
  definition,
  draft,
  fieldLabel,
  onChange,
  onCancel,
  onAdd,
}: {
  definition: FormDefinition;
  draft: RuleDraft;
  fieldLabel: (field: ReturnType<typeof ruleFields>[number]) => string;
  onChange: (draft: RuleDraft) => void;
  onCancel: () => void;
  onAdd: (rule: Rule) => void;
}) {
  const fields = ruleFields(definition);
  const field = fields.find(({ id }) => id === draft.fieldId);
  const rule = draftRule(definition, draft);
  const choices = field && 'options' in field ? field.options : [];
  const needsValue =
    draft.op !== '' && draft.op !== 'answered' && draft.op !== 'unanswered';
  const targets =
    !field || !draft.action
      ? []
      : draft.action === 'show'
        ? showTargets(definition, [field.id]).map((item) => ({
            id: item.id,
            label: fieldLabel(item),
          }))
        : draft.action === 'go-to'
          ? laterPages(definition, field.id).map((page) => ({
              id: page.id,
              label: page.title || 'Untitled page',
            }))
          : definition.endings.map((ending) => ({
              id: ending.id,
              label: ending.title || 'Untitled message',
            }));
  return (
    <fieldset className="condition-editor rule-draft">
      <legend>New rule</legend>
      <p className="field-help">
        This rule does nothing until every part is chosen and you add it.
      </p>
      <div className="rule-sentence">
        <div className="field">
          <label htmlFor="draft-rule-field">When</label>
          <select
            id="draft-rule-field"
            value={draft.fieldId}
            onChange={(event) =>
              onChange({ ...emptyRuleDraft, fieldId: event.target.value })
            }
          >
            <option value="">Choose a question</option>
            {fields.map((item) => (
              <option key={item.id} value={item.id}>
                {fieldLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="draft-rule-op">Condition</label>
          <select
            id="draft-rule-op"
            value={draft.op}
            disabled={!field}
            onChange={(event) => {
              const op = field
                ? operatorsFor(field).find(
                    (item) => item === event.target.value,
                  )
                : undefined;
              onChange({ ...draft, op: op || '', value: '' });
            }}
          >
            <option value="">Choose a condition</option>
            {field &&
              operatorsFor(field).map((op) => (
                <option key={op} value={op}>
                  {operatorLabels[op]}
                </option>
              ))}
          </select>
        </div>
        {field && needsValue && (
          <div className="field">
            <label htmlFor="draft-rule-value">Answer</label>
            {choices.length || field.type === 'acknowledgment' ? (
              <select
                id="draft-rule-value"
                value={draft.value}
                onChange={(event) =>
                  onChange({ ...draft, value: event.target.value })
                }
              >
                <option value="">Choose an answer</option>
                {field.type === 'acknowledgment' ? (
                  <>
                    <option value="true">Accepted</option>
                    <option value="false">Not accepted</option>
                  </>
                ) : (
                  choices.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label || 'Untitled option'}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <input
                id="draft-rule-value"
                type={
                  field.type === 'number'
                    ? 'number'
                    : field.type === 'date'
                      ? 'date'
                      : 'text'
                }
                step={field.type === 'number' ? 'any' : undefined}
                maxLength={10000}
                value={draft.value}
                onChange={(event) =>
                  onChange({ ...draft, value: event.target.value })
                }
              />
            )}
          </div>
        )}
      </div>
      <div className="rule-sentence">
        <div className="field">
          <label htmlFor="draft-rule-action">Then</label>
          <select
            id="draft-rule-action"
            value={draft.action}
            disabled={!field}
            onChange={(event) => {
              const action = (['show', 'go-to', 'end'] as const).find(
                (item) => item === event.target.value,
              );
              onChange({ ...draft, action: action || '', targetId: '' });
            }}
          >
            <option value="">Choose what happens</option>
            <option value="show">show a question</option>
            <option
              value="go-to"
              disabled={!field || !laterPages(definition, field.id).length}
            >
              go to a later page
            </option>
            <option value="end">finish with a message</option>
          </select>
        </div>
        {draft.action && (
          <div className="field">
            <label htmlFor="draft-rule-target">
              {draft.action === 'show'
                ? 'Question to show'
                : draft.action === 'go-to'
                  ? 'Page'
                  : 'Message'}
            </label>
            <select
              id="draft-rule-target"
              value={draft.targetId}
              onChange={(event) =>
                onChange({ ...draft, targetId: event.target.value })
              }
            >
              <option value="">
                {targets.length ? 'Choose one' : 'Nothing available yet'}
              </option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="page-actions">
        <button
          type="button"
          className="button primary compact-button"
          disabled={!rule}
          onClick={() => rule && onAdd(rule)}
        >
          Add rule
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </fieldset>
  );
}
