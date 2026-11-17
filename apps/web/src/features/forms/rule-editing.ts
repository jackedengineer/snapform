import type { Field, FormDefinition } from '@snapform/contracts/form';
import type { Condition, Rule } from '@snapform/contracts/rules';
import { compileDefinition } from '@snapform/contracts/compile';
export type Predicate = Extract<Condition, { fieldId: string }>;
export function ruleFields(definition: FormDefinition): Field[] {
  return definition.pages.flatMap((page) =>
    page.blocks.filter((block): block is Field => 'required' in block),
  );
}
export function operatorsFor(field: Field): Predicate['op'][] {
  const presence: Predicate['op'][] = ['answered', 'unanswered'];
  if (field.type === 'file') return presence;
  if ('options' in field && !field.options.length) return presence;
  if (field.type === 'multiple-choice') return [...presence, 'contains'];
  if (field.type === 'number' || field.type === 'date')
    return [...presence, 'eq', 'neq', 'gt', 'gte', 'lt', 'lte'];
  return [...presence, 'eq', 'neq'];
}
export function predicateFor(field: Field, op: Predicate['op']): Predicate {
  if (!operatorsFor(field).includes(op)) op = 'answered';
  if (op === 'answered' || op === 'unanswered')
    return { op, fieldId: field.id };
  if (op === 'contains')
    return {
      op,
      fieldId: field.id,
      optionId:
        field.type === 'multiple-choice' ? field.options[0]?.id || '' : '',
    };
  const value =
    field.type === 'number'
      ? 0
      : field.type === 'acknowledgment'
        ? true
        : field.type === 'single-choice'
          ? field.options[0]?.id || ''
          : field.type === 'date'
            ? field.min || new Date().toISOString().slice(0, 10)
            : '';
  return { op, fieldId: field.id, value };
}
const ordered = (rules: Rule[]) =>
  [...rules].sort((a, b) => a.priority - b.priority);
const reprioritize = (rules: Rule[]) =>
  rules.map((rule, priority) => ({ ...rule, priority }));
export function conditionFields(condition: Condition): string[] {
  if (condition.op === 'and' || condition.op === 'or')
    return condition.conditions.flatMap(conditionFields);
  if (condition.op === 'not') return conditionFields(condition.condition);
  return [condition.fieldId];
}
// A question can only be shown after every answer its rule compares, and
// only one rule may decide whether a question shows.
export function showTargets(
  definition: FormDefinition,
  fieldIds: string[],
  ruleId?: string,
): Field[] {
  const fields = ruleFields(definition);
  const last = Math.max(
    -1,
    ...fieldIds.map((id) => fields.findIndex((field) => field.id === id)),
  );
  const taken = new Set(
    definition.rules.flatMap(({ id, action }) =>
      action.type === 'show' && id !== ruleId ? [action.fieldId] : [],
    ),
  );
  return fields.slice(last + 1).filter((field) => !taken.has(field.id));
}
export function laterPages(definition: FormDefinition, fieldId: string) {
  const index = definition.pages.findIndex((page) =>
    page.blocks.some((block) => block.id === fieldId),
  );
  return index < 0 ? [] : definition.pages.slice(index + 1);
}
export type RuleDraft = {
  fieldId: string;
  op: Predicate['op'] | '';
  value: string;
  action: Rule['action']['type'] | '';
  targetId: string;
};
export const emptyRuleDraft: RuleDraft = {
  fieldId: '',
  op: '',
  value: '',
  action: '',
  targetId: '',
};
function draftValue(field: Field, value: string) {
  if (value === '') return null;
  if (field.type === 'number')
    return Number.isFinite(Number(value)) ? Number(value) : null;
  if (field.type === 'acknowledgment') return value === 'true';
  return value;
}
/** A new rule exists only once its question, comparison and outcome are chosen. */
export function draftRule(
  definition: FormDefinition,
  draft: RuleDraft,
): Rule | null {
  const field = ruleFields(definition).find(({ id }) => id === draft.fieldId);
  if (!field || !draft.op || !operatorsFor(field).includes(draft.op))
    return null;
  let condition: Predicate = predicateFor(field, draft.op);
  if (condition.op === 'contains') {
    if (!draft.value) return null;
    condition = { ...condition, optionId: draft.value };
  } else if ('value' in condition) {
    const value = draftValue(field, draft.value);
    if (value === null) return null;
    condition = { ...condition, value };
  }
  const page = definition.pages.find((item) =>
    item.blocks.some((block) => block.id === field.id),
  );
  if (!page || !draft.targetId) return null;
  const action: Rule['action'] | null =
    draft.action === 'show'
      ? { type: 'show', fieldId: draft.targetId }
      : draft.action === 'go-to'
        ? { type: 'go-to', fromPageId: page.id, pageId: draft.targetId }
        : draft.action === 'end'
          ? { type: 'end', fromPageId: page.id, endingId: draft.targetId }
          : null;
  if (!action) return null;
  const rule: Rule = {
    id: crypto.randomUUID(),
    priority: Math.min(definition.rules.length, 29),
    condition,
    action,
  };
  const compiled = compileDefinition({
    ...definition,
    rules: [...reprioritize(ordered(definition.rules)), rule],
  });
  return compiled.ok ||
    !compiled.issues.some((issue) => issue.targetId === rule.id)
    ? rule
    : null;
}
export function appendRule(
  definition: FormDefinition,
  rule: Rule,
): FormDefinition | null {
  if (definition.rules.length >= 30) return null;
  return {
    ...definition,
    rules: [
      ...reprioritize(ordered(definition.rules)),
      { ...rule, priority: definition.rules.length },
    ],
  };
}
export function moveRule(
  definition: FormDefinition,
  ruleId: string,
  direction: -1 | 1,
): FormDefinition | null {
  const rules = ordered(definition.rules);
  const index = rules.findIndex((rule) => rule.id === ruleId),
    target = index + direction;
  if (index < 0 || target < 0 || target >= rules.length) return null;
  [rules[index], rules[target]] = [rules[target], rules[index]];
  return { ...definition, rules: reprioritize(rules) };
}
export function removeRule(
  definition: FormDefinition,
  ruleId: string,
): FormDefinition {
  if (!definition.rules.some((rule) => rule.id === ruleId)) return definition;
  return {
    ...definition,
    rules: reprioritize(
      ordered(definition.rules).filter((rule) => rule.id !== ruleId),
    ),
  };
}

export const operatorLabels: Record<Condition['op'], string> = {
  answered: 'has an answer',
  unanswered: 'has no answer',
  eq: 'is',
  neq: 'is not',
  gt: 'is more than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  contains: 'includes',
  and: 'all of these are true',
  or: 'any of these is true',
  not: 'this is not true',
};
