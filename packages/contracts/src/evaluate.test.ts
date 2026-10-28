import { expect, it } from 'vitest';
import { evaluateForm, matchesCondition } from './evaluate.ts';
import { formFixture } from '../test/form-fixture.ts';
import type { Answer } from './answers.ts';
import type { Condition, Rule } from './rules.ts';
const value = (value: string | number | boolean | string[]): Answer => ({
  state: 'value',
  value,
});
const rule = (
  condition: Condition,
  action: Rule['action'],
  priority = 0,
): Rule => ({ id: crypto.randomUUID(), priority, condition, action });
it('runs the default path with zero preserved and required gaps explained', () => {
  const { definition, ids } = formFixture();
  const empty = evaluateForm(definition, {});
  expect(empty.ok && empty.complete).toBe(false);
  if (empty.ok)
    expect(empty.issues.map((issue) => issue.targetId)).toEqual([
      ids.budget,
      ids.contact,
    ]);
  const result = evaluateForm(definition, {
    [ids.budget]: value('0'),
    [ids.contact]: value('person@EXAMPLE.COM'),
  });
  expect(result.ok && result.complete).toBe(true);
  if (result.ok) {
    expect(result.pageIds).toEqual([ids.first, ids.second]);
    expect(result.values).toEqual({
      [ids.budget]: 0,
      [ids.contact]: 'person@example.com',
    });
    expect(result.endingId).toBe(ids.ending);
  }
});
it('removes stale hidden values and cascades applicability on an upstream correction', () => {
  const { definition, ids } = formFixture();
  definition.rules = [
    rule(
      { op: 'eq', fieldId: ids.kind, value: ids.agency },
      { type: 'show', fieldId: ids.budget },
    ),
    rule(
      { op: 'gte', fieldId: ids.budget, value: 100 },
      { type: 'show', fieldId: ids.detail },
      1,
    ),
  ];
  const answers = {
    [ids.kind]: value(ids.agency),
    [ids.budget]: value(100),
    [ids.detail]: value('Historical context'),
    [ids.contact]: value('a@example.com'),
  };
  const first = evaluateForm(definition, answers);
  expect(first.ok && first.values[ids.detail]).toBe('Historical context');
  const corrected = evaluateForm(definition, {
    ...answers,
    [ids.kind]: value(ids.startup),
  });
  expect(corrected.ok && corrected.complete).toBe(true);
  if (corrected.ok) {
    expect(corrected.answers[ids.budget]).toEqual({ state: 'not-applicable' });
    expect(corrected.answers[ids.detail]).toEqual({ state: 'not-applicable' });
    expect(corrected.values).not.toHaveProperty(ids.budget);
    expect(corrected.values).not.toHaveProperty(ids.detail);
    expect(evaluateForm(definition, corrected.answers)).toEqual(corrected);
    const restored = evaluateForm(definition, {
      ...corrected.answers,
      [ids.kind]: value(ids.agency),
    });
    expect(
      restored.ok &&
        restored.issues.find((issue) => issue.targetId === ids.budget)?.code,
    ).toBe('REQUIRED');
  }
});
it('excludes skipped pages and obeys the first matching navigation priority', () => {
  const { definition, ids } = formFixture();
  const lastPageId = crypto.randomUUID();
  definition.pages.push({ id: lastPageId, title: 'Finish', blocks: [] });
  definition.rules = [
    rule(
      { op: 'gte', fieldId: ids.budget, value: 0 },
      { type: 'go-to', fromPageId: ids.first, pageId: lastPageId },
    ),
    rule(
      { op: 'answered', fieldId: ids.budget },
      { type: 'end', fromPageId: ids.first, endingId: ids.ending },
      1,
    ),
  ];
  const result = evaluateForm(definition, {
    [ids.budget]: value(0),
    [ids.contact]: value('old@example.com'),
  });
  expect(result.ok && result.complete).toBe(true);
  if (result.ok) {
    expect(result.pageIds).toEqual([ids.first, lastPageId]);
    expect(result.answers[ids.contact]).toEqual({ state: 'not-applicable' });
    expect(result.values).not.toHaveProperty(ids.contact);
    expect(result.rules).toEqual([
      { id: definition.rules[0].id, matched: true },
    ]);
  }
});
it('chooses an explicit ending while leaving later required fields inapplicable', () => {
  const { definition, ids } = formFixture();
  const endingId = crypto.randomUUID();
  definition.endings.push({
    id: endingId,
    title: 'Follow-up',
    description: '',
  });
  definition.rules = [
    rule(
      { op: 'answered', fieldId: ids.budget },
      { type: 'end', fromPageId: ids.first, endingId },
    ),
  ];
  const result = evaluateForm(definition, { [ids.budget]: value(0) });
  expect(result.ok && result.complete).toBe(true);
  if (result.ok) expect(result.endingId).toBe(endingId);
});
it('rejects unknown field maps and invalid definitions without pretending to evaluate', () => {
  const { definition } = formFixture();
  for (const answers of [
    null,
    [],
    'answers',
    { [crypto.randomUUID()]: value('foreign') },
    Object.fromEntries(
      Array.from({ length: 51 }, () => [crypto.randomUUID(), value(1)]),
    ),
  ])
    expect(evaluateForm(definition, answers).ok).toBe(false);
  expect(evaluateForm({}, {}).ok).toBe(false);
});
it('surfaces invalid visible values once and never exports them', () => {
  const { definition, ids } = formFixture();
  const result = evaluateForm(definition, {
    [ids.budget]: value('invalid'),
    [ids.contact]: value('a@example.com'),
  });
  expect(result.ok && result.complete).toBe(false);
  if (result.ok) {
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('INVALID_ANSWER');
    expect(result.values).not.toHaveProperty(ids.budget);
  }
});
it('records nonmatching navigation and defaults to the next page', () => {
  const { definition, ids } = formFixture();
  definition.rules = [
    rule(
      { op: 'gt', fieldId: ids.budget, value: 10 },
      { type: 'end', fromPageId: ids.first, endingId: ids.ending },
    ),
  ];
  const result = evaluateForm(definition, {
    [ids.budget]: value(0),
    [ids.contact]: value('a@example.com'),
  });
  if (!result.ok) throw new Error('Expected valid fixture');
  expect(result.rules).toEqual([
    { id: definition.rules[0].id, matched: false },
  ]);
  expect(result.pageIds).toEqual([ids.first, ids.second]);
});
it('matches typed predicates and boolean groups without truthiness shortcuts', () => {
  const id = crypto.randomUUID(),
    optionId = crypto.randomUUID();
  const answers = { [id]: value(0) };
  for (const op of ['eq', 'gte', 'lte'] as const)
    expect(matchesCondition({ op, fieldId: id, value: 0 }, answers)).toBe(true);
  for (const op of ['neq', 'gt', 'lt'] as const)
    expect(matchesCondition({ op, fieldId: id, value: 0 }, answers)).toBe(
      false,
    );
  expect(matchesCondition({ op: 'gt', fieldId: id, value: -1 }, answers)).toBe(
    true,
  );
  expect(matchesCondition({ op: 'lt', fieldId: id, value: 1 }, answers)).toBe(
    true,
  );
  expect(
    matchesCondition(
      { op: 'eq', fieldId: id, value: false },
      { [id]: value(false) },
    ),
  ).toBe(true);
  expect(matchesCondition({ op: 'answered', fieldId: id }, answers)).toBe(true);
  expect(matchesCondition({ op: 'unanswered', fieldId: id }, {})).toBe(true);
  expect(matchesCondition({ op: 'neq', fieldId: id, value: 0 }, {})).toBe(
    false,
  );
  expect(
    matchesCondition(
      { op: 'contains', fieldId: id, optionId },
      { [id]: value([optionId]) },
    ),
  ).toBe(true);
  expect(
    matchesCondition({ op: 'contains', fieldId: id, optionId }, answers),
  ).toBe(false);
  expect(
    matchesCondition(
      { op: 'lt', fieldId: id, value: '2026-10-29' },
      { [id]: value('2026-10-28') },
    ),
  ).toBe(true);
  expect(
    matchesCondition(
      { op: 'gt', fieldId: id, value: '2026-10-27' },
      { [id]: value('2026-10-28') },
    ),
  ).toBe(true);
  expect(
    matchesCondition(
      { op: 'gte', fieldId: id, value: '2026-10-28' },
      { [id]: value('2026-10-28') },
    ),
  ).toBe(true);
  expect(
    matchesCondition({ op: 'gte', fieldId: id, value: true }, answers),
  ).toBe(false);
  expect(
    matchesCondition(
      {
        op: 'and',
        conditions: [
          { op: 'answered', fieldId: id },
          { op: 'not', condition: { op: 'eq', fieldId: id, value: 1 } },
        ],
      },
      answers,
    ),
  ).toBe(true);
  expect(
    matchesCondition(
      {
        op: 'or',
        conditions: [
          { op: 'unanswered', fieldId: id },
          { op: 'eq', fieldId: id, value: 0 },
        ],
      },
      answers,
    ),
  ).toBe(true);
});
