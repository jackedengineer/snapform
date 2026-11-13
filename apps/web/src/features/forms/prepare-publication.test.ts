import { expect, it, vi } from 'vitest';
import { newBlankDefinition, newBlock } from './new-form';
import {
  preparePublication,
  publishingIssues,
  publishStatus,
  publishLabel,
  publishReason,
  statusLabels,
} from './prepare-publication';

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
it('derives the header status from the saved publication and local edits', () => {
  const live = {
    publicId: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    number: 2,
    sourceRevision: 7,
    active: true,
    updatedAt: '2026-11-12T09:30:00.000Z',
  };
  expect(publishStatus(null, 1, false)).toBe('draft');
  expect(publishStatus(live, 7, false)).toBe('live');
  expect(publishStatus(live, 8, false)).toBe('changes');
  expect(publishStatus(live, 7, true)).toBe('changes');
  expect(publishStatus({ ...live, active: false }, 7, false)).toBe('stopped');
  expect(statusLabels).toEqual({
    draft: 'Draft',
    live: 'Live',
    changes: 'Live · unpublished changes',
    stopped: 'Stopped',
  });
});
it('says Publishing while a publish is in flight and Retry only after a failure', () => {
  expect(publishLabel('draft', 'idle')).toBe('Publish');
  expect(publishLabel('stopped', 'idle')).toBe('Publish');
  expect(publishLabel('changes', 'idle')).toBe('Publish changes');
  expect(publishLabel('live', 'idle')).toBe('Published');
  for (const status of ['draft', 'changes', 'stopped'] as const) {
    expect(publishLabel(status, 'running')).toBe('Publishing…');
    expect(publishLabel(status, 'failed')).toBe('Retry publishing');
  }
});
it('explains why Publish is unavailable with a count of what to fix', () => {
  expect(publishReason(0, 'saved')).toBe('');
  expect(publishReason(1, 'saved')).toBe('1 thing to fix before publishing.');
  expect(publishReason(3, 'saving')).toBe('3 things to fix before publishing.');
  expect(publishReason(2, 'conflict')).toBe(
    'Review the edit conflict before publishing.',
  );
  expect(publishReason(0, 'blocked')).toBe(
    'Saving is paused. Review the message below.',
  );
});
