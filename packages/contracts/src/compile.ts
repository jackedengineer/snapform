import { z } from 'zod';
import { formDefinitionSchema } from './form.ts';
import type { Field, FormDefinition } from './form.ts';
import type { Condition } from './rules.ts';

export type CompileIssue = { code: string; message: string; targetId?: string };
export type CompileResult =
  | { ok: true; definition: FormDefinition }
  | { ok: false; issues: CompileIssue[] };
type Predicate = Extract<Condition, { fieldId: string }>;
const dateSchema = z.iso.date();
function compatible(condition: Predicate, field: Field): boolean {
  if (condition.op === 'answered' || condition.op === 'unanswered') return true;
  if (condition.op === 'contains')
    return (
      field.type === 'multiple-choice' &&
      field.options.some((option) => option.id === condition.optionId)
    );
  if (field.type === 'number') return typeof condition.value === 'number';
  if (field.type === 'date')
    return (
      typeof condition.value === 'string' &&
      dateSchema.safeParse(condition.value).success
    );
  if (condition.op !== 'eq' && condition.op !== 'neq') return false;
  if (field.type === 'acknowledgment')
    return typeof condition.value === 'boolean';
  if (field.type === 'single-choice')
    return field.options.some((option) => option.id === condition.value);
  return (
    ['short-text', 'long-text', 'email'].includes(field.type) &&
    typeof condition.value === 'string'
  );
}
export function compileDefinition(raw: unknown): CompileResult {
  const decoded = formDefinitionSchema.safeParse(raw);
  if (!decoded.success)
    return {
      ok: false,
      issues: decoded.error.issues.slice(0, 20).map((issue) => ({
        code: 'INVALID_DEFINITION',
        message: `${issue.path.join('.')}: ${issue.message}`,
      })),
    };
  const definition = decoded.data;
  const issues: CompileIssue[] = [];
  const add = (code: string, message: string, targetId?: string) =>
    issues.push({ code, message, targetId });
  const fields = new Map<
    string,
    { field: Field; page: number; position: number }
  >();
  const pages = new Map(
    definition.pages.map((page, index) => [page.id, index]),
  );
  const endings = new Set(definition.endings.map((ending) => ending.id));
  let position = 0;
  definition.pages.forEach((page, pageIndex) => {
    for (const block of page.blocks) {
      if (block.type !== 'heading' && block.type !== 'help')
        fields.set(block.id, {
          field: block,
          page: pageIndex,
          position: position++,
        });
    }
  });
  if (fields.size === 0) add('EMPTY_FORM', 'Add at least one answer field.');
  if (!endings.has(definition.defaultEndingId))
    add('UNKNOWN_ENDING', 'Choose an available default ending.');
  const priorities = new Set<number>();
  const applicability = new Set<string>();
  for (const rule of definition.rules) {
    if (priorities.has(rule.priority))
      add(
        'DUPLICATE_PRIORITY',
        'Each rule needs a different priority.',
        rule.id,
      );
    priorities.add(rule.priority);
    const action = rule.action;
    let targetPosition: number | undefined;
    let fromPage: number | undefined;
    if (action.type === 'show') {
      const target = fields.get(action.fieldId);
      if (!target)
        add('UNKNOWN_FIELD', 'Choose an available field to show.', rule.id);
      targetPosition = target?.position;
      if (applicability.has(action.fieldId))
        add(
          'DUPLICATE_APPLICABILITY',
          'Combine this field’s visibility conditions in one rule.',
          rule.id,
        );
      applicability.add(action.fieldId);
    } else {
      fromPage = pages.get(action.fromPageId);
      if (fromPage === undefined)
        add('UNKNOWN_PAGE', 'Choose an available source page.', rule.id);
      if (action.type === 'go-to') {
        const destination = pages.get(action.pageId);
        if (destination === undefined)
          add('UNKNOWN_PAGE', 'Choose an available destination page.', rule.id);
        else if (fromPage !== undefined && destination <= fromPage)
          add(
            'BACKWARD_NAVIGATION',
            'Navigation must move to a later page.',
            rule.id,
          );
      } else if (!endings.has(action.endingId))
        add('UNKNOWN_ENDING', 'Choose an available ending.', rule.id);
    }
    const check = (condition: Condition): void => {
      if (condition.op === 'and' || condition.op === 'or') {
        condition.conditions.forEach(check);
        return;
      }
      if (condition.op === 'not') {
        check(condition.condition);
        return;
      }
      const source = fields.get(condition.fieldId);
      if (!source) {
        add(
          'UNKNOWN_FIELD',
          'A condition references a missing field.',
          rule.id,
        );
        return;
      }
      if (!compatible(condition, source.field))
        add(
          'INVALID_COMPARISON',
          'The operator or value does not match this field.',
          rule.id,
        );
      if (
        (targetPosition !== undefined && source.position >= targetPosition) ||
        (fromPage !== undefined && source.page > fromPage)
      )
        add(
          'FORWARD_DEPENDENCY',
          'Conditions may only reference earlier available answers.',
          rule.id,
        );
    };
    check(rule.condition);
  }
  return issues.length
    ? { ok: false, issues }
    : {
        ok: true,
        definition: {
          ...definition,
          rules: [...definition.rules].sort((a, b) => a.priority - b.priority),
        },
      };
}
