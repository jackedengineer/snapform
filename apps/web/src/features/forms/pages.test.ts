import { expect, it } from 'vitest';
import { newBlankDefinition, newBlock } from './new-form';
import {
  addPage,
  canRemovePage,
  removePage,
  movePage,
  moveBlockToPage,
} from './pages';
it('adds independent empty pages without mutating the original or exceeding ten', () => {
  const original = newBlankDefinition();
  let current = original;
  for (let count = 1; count < 10; count++) {
    const next = addPage(current);
    if (!next) throw new Error('Expected another page');
    current = next;
  }
  expect(original.pages).toHaveLength(1);
  expect(current.pages).toHaveLength(10);
  expect(new Set(current.pages.map((page) => page.id)).size).toBe(10);
  expect(addPage(current)).toBeNull();
});
it('only removes an empty unreferenced page and never the last page', () => {
  const original = newBlankDefinition();
  expect(canRemovePage(original, original.pages[0].id)).toBe(false);
  const next = addPage(original)!;
  const pageId = next.pages[1].id;
  expect(canRemovePage(next, pageId)).toBe(true);
  expect(removePage(next, pageId)?.pages).toHaveLength(1);
  next.pages[1].blocks.push(newBlock('email'));
  expect(removePage(next, pageId)).toBeNull();
  expect(removePage(next, crypto.randomUUID())).toBeNull();
});
it('protects pages used as a routing source or destination', () => {
  const next = addPage(newBlankDefinition())!;
  const field = newBlock('email');
  next.pages[0].blocks.push(field);
  next.rules = [
    {
      id: crypto.randomUUID(),
      priority: 0,
      condition: { op: 'answered', fieldId: field.id },
      action: {
        type: 'go-to',
        fromPageId: next.pages[0].id,
        pageId: next.pages[1].id,
      },
    },
  ];
  expect(removePage(next, next.pages[1].id)).toBeNull();
  next.rules[0].action = {
    type: 'end',
    fromPageId: next.pages[1].id,
    endingId: next.defaultEndingId,
  };
  expect(removePage(next, next.pages[1].id)).toBeNull();
});
it('reorders pages without replacing identities, definitions or rules', () => {
  const first = addPage(newBlankDefinition())!;
  const next = movePage(first, first.pages[1].id, -1)!;
  expect(next.pages.map((page) => page.id)).toEqual(
    [...first.pages].reverse().map((page) => page.id),
  );
  expect(next.rules).toBe(first.rules);
  expect(movePage(first, first.pages[0].id, -1)).toBeNull();
  expect(movePage(first, first.pages[1].id, 1)).toBeNull();
});
it('moves a question atomically with its identity and limits intact', () => {
  const original = addPage(newBlankDefinition())!;
  const block = newBlock('multiple-choice');
  original.pages[0].blocks.push(block);
  const next = moveBlockToPage(original, block.id, original.pages[1].id)!;
  expect(next.pages[0].blocks).toHaveLength(0);
  expect(next.pages[1].blocks[0]).toEqual(block);
  expect(original.pages[0].blocks).toHaveLength(1);
  expect(moveBlockToPage(next, block.id, next.pages[1].id)).toBe(next);
  expect(
    moveBlockToPage(next, crypto.randomUUID(), next.pages[0].id),
  ).toBeNull();
  expect(moveBlockToPage(next, block.id, crypto.randomUUID())).toBeNull();
});
