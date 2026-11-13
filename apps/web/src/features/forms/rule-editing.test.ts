import { expect, it } from 'vitest';
import { compileDefinition } from '@snapform/contracts/compile';
import { newBlankDefinition, newBlock } from './new-form';
import {
  appendRule,
  draftRule,
  emptyRuleDraft,
  showTargets,
  moveRule,
  removeRule,
  operatorsFor,
  predicateFor,
} from './rule-editing';
// New questions start unlabeled; give fixtures a label so they can compile.
function question(type: Parameters<typeof newBlock>[0]) {
  const block = newBlock(type);
  return 'label' in block ? { ...block, label: `About ${type}` } : block;
}
function threeQuestions() {
  const definition = newBlankDefinition();
  const [a, b, c] = [
    question('email'),
    question('long-text'),
    question('number'),
  ];
  definition.pages[0].blocks.push(a, b, c);
  return { definition, a, b, c };
}
it('keeps a new rule inert until every part is chosen', () => {
  const { definition, a, b } = threeQuestions();
  const complete = {
    ...emptyRuleDraft,
    fieldId: a.id,
    op: 'answered' as const,
    action: 'show' as const,
    targetId: b.id,
  };
  for (const partial of [
    emptyRuleDraft,
    { ...emptyRuleDraft, fieldId: a.id },
    { ...complete, op: '' as const },
    { ...complete, action: '' as const },
    { ...complete, targetId: '' },
    { ...complete, targetId: a.id },
    { ...complete, op: 'eq' as const, value: '' },
  ])
    expect(draftRule(definition, partial)).toBeNull();
  const rule = draftRule(definition, complete);
  expect(rule).toMatchObject({
    condition: { op: 'answered', fieldId: a.id },
    action: { type: 'show', fieldId: b.id },
  });
  expect(
    draftRule(definition, { ...complete, op: 'eq', value: 'qa@example.com' }),
  ).toMatchObject({ condition: { op: 'eq', value: 'qa@example.com' } });
  let current = definition;
  for (let count = 0; count < 30; count++) {
    const next = draftRule(current, complete);
    if (!next) throw new Error('Expected a complete rule');
    current = appendRule(current, {
      ...next,
      action: {
        type: 'end',
        fromPageId: current.pages[0].id,
        endingId: current.defaultEndingId,
      },
    })!;
  }
  expect(current.rules.map((item) => item.priority)).toEqual(
    Array.from({ length: 30 }, (_, index) => index),
  );
  expect(compileDefinition(current).ok).toBe(true);
  expect(appendRule(current, rule!)).toBeNull();
});
it('offers only later questions that no other rule already shows', () => {
  const { definition, a, b, c } = threeQuestions();
  const ids = (fields: { id: string }[]) => fields.map((field) => field.id);
  expect(ids(showTargets(definition, [a.id]))).toEqual([b.id, c.id]);
  expect(ids(showTargets(definition, [b.id]))).toEqual([c.id]);
  expect(ids(showTargets(definition, [c.id]))).toEqual([]);
  const rule = draftRule(definition, {
    ...emptyRuleDraft,
    fieldId: a.id,
    op: 'answered',
    action: 'show',
    targetId: c.id,
  })!;
  const next = appendRule(definition, rule)!;
  expect(ids(showTargets(next, [a.id]))).toEqual([b.id]);
  expect(ids(showTargets(next, [a.id], rule.id))).toEqual([b.id, c.id]);
});
it('keeps ordered priorities contiguous when moving or removing rules', () => {
  const { definition, a } = threeQuestions();
  const end = draftRule(definition, {
    ...emptyRuleDraft,
    fieldId: a.id,
    op: 'answered',
    action: 'end',
    targetId: definition.defaultEndingId,
  })!;
  let current = definition;
  for (let count = 0; count < 3; count++)
    current = appendRule(current, { ...end, id: crypto.randomUUID() })!;
  const ids = current.rules.map((rule) => rule.id);
  current = moveRule(current, ids[2], -1)!;
  expect(current.rules.map((rule) => rule.id)).toEqual([
    ids[0],
    ids[2],
    ids[1],
  ]);
  expect(current.rules.map((rule) => rule.priority)).toEqual([0, 1, 2]);
  current = removeRule(current, ids[0]);
  expect(current.rules.map((rule) => rule.priority)).toEqual([0, 1]);
  expect(moveRule(current, ids[2], -1)).toBeNull();
  expect(moveRule(current, crypto.randomUUID(), 1)).toBeNull();
  expect(removeRule(current, crypto.randomUUID())).toBe(current);
});
it('offers only operators compatible with each answer type and typed initial values', () => {
  const number = newBlock('number'),
    single = newBlock('single-choice'),
    multi = newBlock('multiple-choice'),
    file = newBlock('file'),
    acknowledgment = newBlock('acknowledgment');
  if (
    single.type !== 'single-choice' ||
    multi.type !== 'multiple-choice' ||
    number.type !== 'number' ||
    file.type !== 'file' ||
    acknowledgment.type !== 'acknowledgment'
  )
    throw new Error('Expected answer fields');
  expect(operatorsFor(number)).toContain('gte');
  expect(operatorsFor(file)).toEqual(['answered', 'unanswered']);
  expect(operatorsFor(multi)).toEqual(['answered', 'unanswered', 'contains']);
  expect(predicateFor(number, 'eq')).toEqual({
    op: 'eq',
    fieldId: number.id,
    value: 0,
  });
  expect(predicateFor(acknowledgment, 'eq')).toMatchObject({
    value: true,
  });
  expect(predicateFor(single, 'eq')).toMatchObject({
    value: single.options[0].id,
  });
  expect(predicateFor(multi, 'contains')).toMatchObject({
    optionId: multi.options[0].id,
  });
  expect(predicateFor(multi, 'gte')).toEqual({
    op: 'answered',
    fieldId: multi.id,
  });
  expect(operatorsFor({ ...multi, options: [] })).toEqual([
    'answered',
    'unanswered',
  ]);
});
it('generates compiler-compatible comparisons for all nine answer types', () => {
  const types = [
    'short-text',
    'long-text',
    'email',
    'number',
    'single-choice',
    'multiple-choice',
    'date',
    'acknowledgment',
    'file',
  ] as const;
  for (const type of types) {
    const field = question(type);
    if (!('required' in field)) throw new Error('Expected answer field');
    const definition = newBlankDefinition();
    definition.pages[0].blocks.push(field);
    for (const op of operatorsFor(field)) {
      definition.rules = [
        {
          id: crypto.randomUUID(),
          priority: 0,
          condition: predicateFor(field, op),
          action: {
            type: 'end',
            fromPageId: definition.pages[0].id,
            endingId: definition.defaultEndingId,
          },
        },
      ];
      expect(compileDefinition(definition).ok, `${type} ${op}`).toBe(true);
    }
  }
});
