import { expect, it } from 'vitest';
import { newBlankDefinition } from './new-form';
import { addEnding, canRemoveEnding, removeEnding } from './endings';
it('adds independent endings while preserving the default and a ten-ending cap', () => {
  const original = newBlankDefinition();
  let current = original;
  for (let count = 1; count < 10; count++) current = addEnding(current)!;
  expect(original.endings).toHaveLength(1);
  expect(current.endings).toHaveLength(10);
  expect(new Set(current.endings.map((ending) => ending.id)).size).toBe(10);
  expect(current.defaultEndingId).toBe(original.defaultEndingId);
  expect(addEnding(current)).toBeNull();
});
it('protects the default, final, unknown and rule-referenced endings', () => {
  const original = newBlankDefinition();
  expect(removeEnding(original, original.defaultEndingId)).toBeNull();
  const next = addEnding(original)!;
  const endingId = next.endings[1].id;
  expect(canRemoveEnding(next, endingId)).toBe(true);
  expect(removeEnding(next, endingId)?.endings).toEqual(original.endings);
  expect(removeEnding(next, crypto.randomUUID())).toBeNull();
  next.rules = [
    {
      id: crypto.randomUUID(),
      priority: 0,
      condition: { op: 'answered', fieldId: crypto.randomUUID() },
      action: { type: 'end', fromPageId: next.pages[0].id, endingId },
    },
  ];
  expect(removeEnding(next, endingId)).toBeNull();
  expect(next.endings).toHaveLength(2);
});
it('allows default changes without rewriting or removing another ending', () => {
  const original = addEnding(newBlankDefinition())!;
  const next = { ...original, defaultEndingId: original.endings[1].id };
  const removed = removeEnding(next, original.defaultEndingId)!;
  expect(removed.defaultEndingId).toBe(next.defaultEndingId);
  expect(removed.endings).toEqual([next.endings[1]]);
  expect(original.endings).toHaveLength(2);
});
