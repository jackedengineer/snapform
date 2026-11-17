import type { Answer } from '@snapform/contracts/answers';
import { evaluateForm } from '@snapform/contracts/evaluate';
import type { Field, FormDefinition } from '@snapform/contracts/form';
import type { Condition } from '@snapform/contracts/rules';

const conditionFields = (condition: Condition): string[] =>
  condition.op === 'and' || condition.op === 'or'
    ? condition.conditions.flatMap(conditionFields)
    : condition.op === 'not'
      ? conditionFields(condition.condition)
      : [condition.fieldId];

// The brief an owner reads first: the answers the form's own rules qualify
// on (budget, service, timing) and other answered choices, up to four, and
// which ending the client reached when there is more than one.
export function briefOf(
  definition: FormDefinition,
  answers: Record<string, Answer>,
  limit = 4,
) {
  const fields = definition.pages
    .flatMap((page) => page.blocks)
    .filter((block): block is Field => 'required' in block)
    .filter((field) => answers[field.id]?.state === 'value');
  const qualifying = new Set(
    definition.rules.flatMap((rule) => conditionFields(rule.condition)),
  );
  // Qualifying answers claim places first; answered choices fill the rest;
  // the brief then reads in form order.
  const choices = fields.filter(
    (field) =>
      !qualifying.has(field.id) &&
      (field.type === 'single-choice' || field.type === 'multiple-choice'),
  );
  const picked = new Set(
    [...fields.filter((field) => qualifying.has(field.id)), ...choices]
      .slice(0, limit)
      .map((field) => field.id),
  );
  let outcome: string | undefined;
  if (definition.endings.length > 1) {
    const evaluation = evaluateForm(definition, answers);
    if (evaluation.ok)
      outcome = definition.endings.find(
        (ending) => ending.id === evaluation.endingId,
      )?.title;
  }
  return { fields: fields.filter((field) => picked.has(field.id)), outcome };
}
