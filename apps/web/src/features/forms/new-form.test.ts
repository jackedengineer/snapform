import { expect, it } from 'vitest';
import { blockSchema, formDefinitionSchema } from '@snapform/contracts/form';
import type { Block } from '@snapform/contracts/form';
import { compileDefinition } from '@snapform/contracts/compile';
import {
  blockNames,
  newBlock,
  newBlankDefinition,
  duplicateBlock,
  questionNumbers,
  insertOption,
} from './new-form';
it('adds an empty option after the one being edited and stops at twenty', () => {
  const block = newBlock('single-choice');
  if (block.type !== 'single-choice') throw new Error('Expected choices');
  const next = insertOption(block, block.options[0].id);
  if (!next) throw new Error('Expected another option');
  expect(next.block.options.map((option) => option.label)).toEqual([
    'Option 1',
    '',
    'Option 2',
  ]);
  expect(next.block.options[1].id).toBe(next.optionId);
  expect(block.options).toHaveLength(2);
  const full = {
    ...block,
    options: Array.from({ length: 20 }, () => ({
      id: crypto.randomUUID(),
      label: 'Choice',
    })),
  };
  expect(insertOption(full, full.options[0].id)).toBeNull();
});
it('starts new questions and the first page empty so authors write their own words', () => {
  const definition = newBlankDefinition();
  // The title field shows "Untitled form" as a placeholder; publishing asks
  // for a real title instead of showing respondents that placeholder.
  expect(definition.title).toBe('');
  expect(definition.pages[0].title).toBe('');
  for (const type of Object.keys(blockNames) as Block['type'][]) {
    const block = newBlock(type);
    if ('label' in block) expect(block.label).toBe('');
  }
  const question = newBlock('short-text');
  definition.pages[0].blocks.push(question);
  expect(formDefinitionSchema.safeParse(definition).success).toBe(true);
  const compiled = compileDefinition(definition);
  expect(compiled.ok).toBe(false);
  if (!compiled.ok)
    expect(compiled.issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_LABEL', targetId: question.id }),
    );
});
it('numbers questions across pages and leaves content blocks unnumbered', () => {
  const definition = newBlankDefinition();
  const [first, heading, second, third] = [
    newBlock('email'),
    newBlock('heading'),
    newBlock('date'),
    newBlock('number'),
  ];
  definition.pages[0].blocks = [first, heading];
  definition.pages.push({
    id: crypto.randomUUID(),
    title: '',
    blocks: [second, third],
  });
  expect(questionNumbers(definition)).toEqual(
    new Map([
      [first.id, 1],
      [second.id, 2],
      [third.id, 3],
    ]),
  );
});
it('creates bounded fresh definitions and every supported editable block', () => {
  const first = newBlankDefinition(),
    second = newBlankDefinition();
  expect(formDefinitionSchema.safeParse(first).success).toBe(true);
  expect(first.pages[0].id).not.toBe(second.pages[0].id);
  for (const type of Object.keys(blockNames) as Block['type'][])
    expect(blockSchema.safeParse(newBlock(type)).success).toBe(true);
});
it('duplicates choices with independent identities and preserves original meaning', () => {
  const original = newBlock('single-choice');
  const copy = duplicateBlock(original);
  expect(copy.id).not.toBe(original.id);
  if (original.type !== 'single-choice' || copy.type !== 'single-choice')
    throw new Error('Expected choices');
  expect(copy.options[0].id).not.toBe(original.options[0].id);
  copy.options[0].label = 'Changed';
  expect(original.options[0].label).toBe('Option 1');
});
it('bounds outline captions without changing full text or splitting emoji graphemes', async () => {
  const { blockCaption } = await import('./new-form');
  const block = newBlock('help');
  if (block.type !== 'help') throw new Error('Expected help');
  block.text = '👨‍👩‍👧‍👦'.repeat(500);
  expect(blockCaption(block)).toBe('👨‍👩‍👧‍👦'.repeat(80) + '…');
  expect(block.text).toBe('👨‍👩‍👧‍👦'.repeat(500));
  expect(blockCaption({ ...block, text: '  Brief context  ' })).toBe(
    'Brief context',
  );
  expect(blockCaption({ ...block, text: '' })).toBe('Untitled question');
});
