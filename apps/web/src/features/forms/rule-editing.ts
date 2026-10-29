import type { Field, FormDefinition } from '@snapform/contracts/form';
import type { Condition, Rule } from '@snapform/contracts/rules';
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
export function addRule(definition: FormDefinition): FormDefinition | null {
  const fields = ruleFields(definition);
  if (!fields.length || definition.rules.length >= 30) return null;
  const target = fields
    .slice(1)
    .find(
      (field) =>
        !definition.rules.some(
          ({ action }) => action.type === 'show' && action.fieldId === field.id,
        ),
    );
  const sourcePage = definition.pages.find((page) =>
    page.blocks.some((block) => block.id === fields[0].id),
  )!;
  const action: Rule['action'] = target
    ? { type: 'show', fieldId: target.id }
    : {
        type: 'end',
        fromPageId: sourcePage.id,
        endingId: definition.defaultEndingId,
      };
  return {
    ...definition,
    rules: [
      ...reprioritize(ordered(definition.rules)),
      {
        id: crypto.randomUUID(),
        priority: definition.rules.length,
        condition: predicateFor(fields[0], 'answered'),
        action,
      },
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
