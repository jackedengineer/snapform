import { expect, it } from 'vitest';
import { blockSchema, formDefinitionSchema } from '@snapform/contracts/form';
import type { Block } from '@snapform/contracts/form';
import {
  blockNames,
  newBlock,
  newBlankDefinition,
  duplicateBlock,
} from './new-form';
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
