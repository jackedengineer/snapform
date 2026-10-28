import { z } from 'zod';
import { compileDefinition } from './compile.ts';
import type { CompileIssue } from './compile.ts';
import { decodeAnswer, requiredAnswerIssue } from './answers.ts';
import type { Answer } from './answers.ts';
import type { Condition } from './rules.ts';

type AnswerValue = Extract<Answer, { state: 'value' }>['value'];
export type FormEvaluation =
  | { ok: false; issues: CompileIssue[] }
  | {
      ok: true;
      complete: boolean;
      answers: Record<string, Answer>;
      values: Record<string, AnswerValue>;
      issues: CompileIssue[];
      pageIds: string[];
      endingId: string;
      rules: { id: string; matched: boolean }[];
    };
const answerMap = z
  .record(z.uuid(), z.unknown())
  .refine((answers) => Object.keys(answers).length <= 50);

// Called only with compiled conditions and decoded effective answers.
export function matchesCondition(
  condition: Condition,
  answers: Record<string, Answer>,
): boolean {
  if (condition.op === 'and')
    return condition.conditions.every((child) =>
      matchesCondition(child, answers),
    );
  if (condition.op === 'or')
    return condition.conditions.some((child) =>
      matchesCondition(child, answers),
    );
  if (condition.op === 'not')
    return !matchesCondition(condition.condition, answers);
  const answer = answers[condition.fieldId];
  if (condition.op === 'answered') return answer?.state === 'value';
  if (condition.op === 'unanswered') return answer?.state !== 'value';
  if (answer?.state !== 'value') return false;
  if (condition.op === 'contains')
    return (
      Array.isArray(answer.value) && answer.value.includes(condition.optionId)
    );
  const actual = answer.value,
    expected = condition.value;
  if (condition.op === 'eq') return actual === expected;
  if (condition.op === 'neq') return actual !== expected;
  let order: number | undefined;
  if (typeof actual === 'number' && typeof expected === 'number')
    order = Math.sign(actual - expected);
  else if (typeof actual === 'string' && typeof expected === 'string') {
    order = 0;
    if (actual > expected) order = 1;
    else if (actual < expected) order = -1;
  }
  if (order === undefined) return false;
  switch (condition.op) {
    case 'gt':
      return order > 0;
    case 'gte':
      return order >= 0;
    case 'lt':
      return order < 0;
    case 'lte':
      return order <= 0;
  }
}
export function evaluateForm(
  rawDefinition: unknown,
  rawAnswers: unknown = {},
): FormEvaluation {
  const compiled = compileDefinition(rawDefinition);
  if (!compiled.ok) return compiled;
  const input = answerMap.safeParse(rawAnswers);
  if (!input.success)
    return {
      ok: false,
      issues: [
        {
          code: 'INVALID_ANSWERS',
          message: 'Use an answer map with at most 50 field identities.',
        },
      ],
    };
  const definition = compiled.definition;
  const answers: Record<string, Answer> = {};
  for (const page of definition.pages)
    for (const block of page.blocks)
      if ('required' in block) answers[block.id] = { state: 'not-applicable' };
  const unknown = Object.keys(input.data).filter(
    (id) => !Object.hasOwn(answers, id),
  );
  if (unknown.length)
    return {
      ok: false,
      issues: unknown.map((targetId) => ({
        code: 'UNKNOWN_FIELD',
        message: 'An answer references a field outside this form.',
        targetId,
      })),
    };
  const issues: CompileIssue[] = [];
  const pageIds: string[] = [];
  const rules: { id: string; matched: boolean }[] = [];
  let pageIndex = 0,
    endingId = definition.defaultEndingId;
  while (pageIndex < definition.pages.length) {
    const page = definition.pages[pageIndex];
    pageIds.push(page.id);
    for (const block of page.blocks) {
      if (!('required' in block)) continue;
      const visibility = definition.rules.find(
        (rule) =>
          rule.action.type === 'show' && rule.action.fieldId === block.id,
      );
      if (visibility) {
        const matched = matchesCondition(visibility.condition, answers);
        rules.push({ id: visibility.id, matched });
        if (!matched) continue;
      }
      const previous = input.data[block.id];
      const wasHidden =
        previous !== null &&
        typeof previous === 'object' &&
        Object.keys(previous).length === 1 &&
        'state' in previous &&
        previous.state === 'not-applicable';
      // A revealed field needs a fresh answer; a prior hidden state is never consent to omit it.
      const decoded = decodeAnswer(block, wasHidden ? undefined : previous);
      if (!decoded.ok) {
        answers[block.id] = { state: 'missing' };
        issues.push({
          code: 'INVALID_ANSWER',
          message: decoded.error,
          targetId: block.id,
        });
        continue;
      }
      answers[block.id] = decoded.answer;
      const required = requiredAnswerIssue(block, decoded.answer);
      if (required)
        issues.push({
          code: 'REQUIRED',
          message: required,
          targetId: block.id,
        });
    }
    let nextIndex = pageIndex + 1,
      ended = false;
    for (const rule of definition.rules) {
      const action = rule.action;
      if (action.type === 'show' || action.fromPageId !== page.id) continue;
      const matched = matchesCondition(rule.condition, answers);
      rules.push({ id: rule.id, matched });
      if (!matched) continue;
      if (action.type === 'end') {
        endingId = action.endingId;
        ended = true;
      } else
        nextIndex = definition.pages.findIndex(
          (candidate) => candidate.id === action.pageId,
        );
      break;
    }
    if (ended) break;
    pageIndex = nextIndex;
  }
  const values: Record<string, AnswerValue> = {};
  for (const [id, answer] of Object.entries(answers))
    if (answer.state === 'value') values[id] = answer.value;
  return {
    ok: true,
    complete: issues.length === 0,
    answers,
    values,
    issues,
    pageIds,
    endingId,
    rules,
  };
}
