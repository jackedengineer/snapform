import { expect, it, vi } from 'vitest';
import { newBlankDefinition, newBlock } from './new-form';
import { preparePublication, publishingIssues } from './prepare-publication';

function question(type: Parameters<typeof newBlock>[0], label: string) {
  const block = newBlock(type);
  return 'label' in block ? { ...block, label } : block;
}
function draft() {
  const definition = newBlankDefinition();
  definition.pages[0].blocks.push(question('email', 'Where can we reach you?'));
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
  definition.pages[0].blocks.push(question('file', 'Brief'));
  await expect(preparePublication(definition, flush, read)).rejects.toThrow();
  expect(flush).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
it('names the question, rule or ending behind each publishing issue', () => {
  const definition = draft();
  expect(publishingIssues(definition)).toEqual([]);
  const blank = newBlock('short-text');
  const file = question('file', 'Upload your brief');
  definition.pages.push({
    id: crypto.randomUUID(),
    title: '',
    blocks: [newBlock('help'), blank, file],
  });
  definition.endings[0].title = '';
  expect(publishingIssues({ ...definition, title: '' })).toEqual([
    {
      message: 'Question 2 (Short answer): Add a label to this question.',
      targetId: blank.id,
    },
    { message: 'Add a form title.', targetId: undefined },
    {
      message: 'Ending 1: Add an ending title.',
      targetId: definition.endings[0].id,
    },
    {
      message:
        'Question 3, “Upload your brief”: File upload isn’t available yet. Remove this question to publish.',
      targetId: file.id,
    },
  ]);
});
