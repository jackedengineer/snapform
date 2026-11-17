import { expect, it } from 'vitest';
import type { FormDefinition } from '@snapform/contracts/form';
import { previewState } from './preview-state';
import { newBlankDefinition, newBlock } from './new-form';

// A local fixture keeps these preview checks independent of starter content.
// New questions start unlabelled; an author labels them before previewing.
function question(
  type: 'short-text' | 'long-text' | 'email',
  label: string,
  required = false,
) {
  const block = newBlock(type);
  if (!('required' in block)) throw new Error('Expected a question block.');
  return { ...block, label, required };
}
function contactForm() {
  // Pages of several questions; the card test below switches explicitly.
  const definition: FormDefinition = {
    ...newBlankDefinition(),
    title: 'Synthetic enquiry',
    presentation: 'page',
  };
  definition.pages[0].blocks = [
    question('short-text', 'Your name'),
    question('email', 'Work email', true),
    question('short-text', 'Company'),
    question('long-text', 'What do you need?'),
    question('long-text', 'Anything else?'),
  ];
  return definition;
}

it('blocks incomplete preview steps and allows a valid contact answer', () => {
  const definition = contactForm();
  const empty = previewState(definition, {}, '');
  expect(empty.ok).toBe(true);
  if (!empty.ok) throw new Error('Invalid starter');
  expect(empty.issues).toHaveLength(1);
  const email = definition.pages[0].blocks.find(
    (block) => block.type === 'email',
  )!;
  const valid = previewState(
    definition,
    { [email.id]: { state: 'value', value: 'synthetic@example.com' } },
    'missing-step',
  );
  expect(valid.ok && valid.issues).toEqual([]);
  expect(valid.ok && valid.index).toBe(0);
});
it('uses the collector card steps and rejects an invalid definition', () => {
  const definition = contactForm();
  definition.presentation = 'card';
  const state = previewState(definition, {}, definition.pages[0].blocks[1].id);
  expect(state.ok && state.index).toBe(1);
  expect(state.ok && state.steps).toHaveLength(5);
  expect(state.ok && state.issues).toHaveLength(1);
  definition.pages[0].blocks[0].id = definition.pages[0].blocks[1].id;
  expect(previewState(definition, {}, '').ok).toBe(false);
});
