import { expect, it, vi } from 'vitest';
import { newBlankDefinition, newBlock } from './new-form';
import { preparePublication } from './prepare-publication';

function draft() {
  const definition = newBlankDefinition();
  definition.pages[0].blocks.push(newBlock('email'));
  return definition;
}
it('waits for the last edit to save before reading the publish revision', async () => {
  const definition = draft();
  let saved = {
    definition: { ...definition, title: 'Old title' },
    revision: 1,
  };
  const flush = async () => {
    saved = { definition, revision: 2 };
  };
  expect(await preparePublication(definition, flush, async () => saved)).toBe(
    2,
  );
});
it('refuses an older saved definition after a failed or incomplete save', async () => {
  const definition = draft();
  await expect(
    preparePublication(
      definition,
      async () => {},
      async () => ({
        definition: { ...definition, title: 'Old title' },
        revision: 1,
      }),
    ),
  ).rejects.toThrow('Save these changes');
});
it('blocks invalid definitions and files before attempting publication preparation', async () => {
  const flush = vi.fn();
  const read = vi.fn();
  const definition = draft();
  await expect(
    preparePublication({ ...definition, title: '' }, flush, read),
  ).rejects.toThrow();
  definition.pages[0].blocks.push(newBlock('file'));
  await expect(preparePublication(definition, flush, read)).rejects.toThrow();
  expect(flush).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
