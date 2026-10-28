import { expect, it } from 'vitest';
import { conditionSchema, ruleSchema } from './rules.ts';
const fieldId = crypto.randomUUID();
const answered = { op: 'answered', fieldId };
it('accepts typed predicates and bounded boolean composition', () => {
  for (const condition of [
    answered,
    { op: 'unanswered', fieldId },
    { op: 'eq', fieldId, value: false },
    { op: 'gt', fieldId, value: 0 },
    { op: 'contains', fieldId, optionId: crypto.randomUUID() },
    { op: 'and', conditions: [answered, { op: 'not', condition: answered }] },
    { op: 'or', conditions: [answered] },
  ])
    expect(conditionSchema.safeParse(condition).success).toBe(true);
});
it('rejects executable, oversized and deeply nested expressions', () => {
  let nested: unknown = answered;
  for (let i = 0; i < 3; i++) nested = { op: 'not', condition: nested };
  expect(conditionSchema.safeParse(nested).success).toBe(true);
  for (const condition of [
    { op: 'not', condition: nested },
    { op: 'and', conditions: [] },
    { op: 'or', conditions: Array(9).fill(answered) },
    { op: 'eval', script: 'return true' },
    { ...answered, value: 'forged' },
    { op: 'eq', fieldId, value: [] },
    { op: 'contains', fieldId, optionId: 'label' },
  ])
    expect(conditionSchema.safeParse(condition).success).toBe(false);
});
it('limits rule actions and explicit priority', () => {
  const value = { id: crypto.randomUUID(), priority: 0, condition: answered };
  const fromPageId = crypto.randomUUID();
  for (const action of [
    { type: 'show', fieldId },
    { type: 'go-to', fromPageId, pageId: crypto.randomUUID() },
    { type: 'end', fromPageId, endingId: crypto.randomUUID() },
  ])
    expect(ruleSchema.safeParse({ ...value, action }).success).toBe(true);
  for (const input of [
    { ...value, priority: 30, action: { type: 'show', fieldId } },
    { ...value, priority: 0.5, action: { type: 'show', fieldId } },
    { ...value, action: { type: 'charge', amount: 10 } },
  ])
    expect(ruleSchema.safeParse(input).success).toBe(false);
});
it('rejects pathological input nesting without an unbounded recursive parser', () => {
  let condition: unknown = answered;
  for (let i = 0; i < 10000; i++) condition = { op: 'not', condition };
  expect(conditionSchema.safeParse(condition).success).toBe(false);
});
