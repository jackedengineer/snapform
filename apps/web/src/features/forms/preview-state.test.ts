import { expect, it } from 'vitest';
import { previewState } from './preview-state';
import { newBlankDefinition, newBlock } from './new-form';

// A local fixture keeps these preview checks independent of starter content.
function contactForm() {
  const definition = newBlankDefinition();
  const email = newBlock('email');
  if (email.type !== 'email') throw new Error('Expected an email block.');
  definition.pages[0].blocks = [
    newBlock('short-text'),
    { ...email, required: true },
    newBlock('short-text'),
    newBlock('long-text'),
    newBlock('long-text'),
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
