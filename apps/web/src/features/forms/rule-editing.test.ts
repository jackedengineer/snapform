import { expect, it } from 'vitest';
import { compileDefinition } from '@snapform/contracts/compile';
import { newBlankDefinition, newBlock } from './new-form';
import {
  addRule,
  moveRule,
  removeRule,
  operatorsFor,
  predicateFor,
} from './rule-editing';
it('creates a valid visibility rule with stable identities and stops at thirty', () => {
  const original = newBlankDefinition();
  original.pages[0].blocks.push(newBlock('email'), newBlock('long-text'));
  const next = addRule(original)!;
  expect(original.rules).toEqual([]);
  expect(next.rules[0].condition).toEqual({
    op: 'answered',
    fieldId: original.pages[0].blocks[0].id,
  });
  expect(next.rules[0].action).toEqual({
    type: 'show',
    fieldId: original.pages[0].blocks[1].id,
  });
  expect(compileDefinition(next).ok).toBe(true);
  let current = next;
  while (current.rules.length < 30) current = addRule(current)!;
  expect(addRule(current)).toBeNull();
  expect(new Set(current.rules.map((rule) => rule.id)).size).toBe(30);
  expect(compileDefinition(current).ok).toBe(true);
  expect(addRule(newBlankDefinition())).toBeNull();
});
it('keeps ordered priorities contiguous when moving or removing rules', () => {
  const original = newBlankDefinition();
  original.pages[0].blocks.push(newBlock('email'));
  let current = addRule(addRule(addRule(original)!)!)!;
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
