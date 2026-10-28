import { expect, it } from 'vitest';
import { newBlankDefinition } from './new-form';
import { readLocalDraft, localDraftKey } from './local-draft';
const scope = {
  userId: 'qa-user',
  workspaceId: '28765529-6337-4512-b148-f735ad07d28b',
  formId: 'bfdaf8c5-7728-4da6-a1b8-8d4c69a71ff6',
};
function record() {
  return {
    version: 1,
    ...scope,
    editorId: crypto.randomUUID(),
    updatedAt: 1000000,
    revision: 12,
    definition: newBlankDefinition(),
    pending: null,
    backup: null,
  };
}
it('reads only matching, bounded, recent form buffers without credentials', () => {
  const input = record();
  expect(readLocalDraft(input, scope, 1000001)).toEqual(input);
  expect(
    readLocalDraft(input, { ...scope, userId: 'other' }, 1000001),
  ).toBeNull();
  expect(
    readLocalDraft(
      input,
      { ...scope, workspaceId: crypto.randomUUID() },
      1000001,
    ),
  ).toBeNull();
  expect(
    readLocalDraft(input, { ...scope, formId: crypto.randomUUID() }, 1000001),
  ).toBeNull();
  expect(
    readLocalDraft(input, scope, input.updatedAt + 7 * 86400000),
  ).toBeNull();
  expect(readLocalDraft(input, scope, input.updatedAt - 1)).toBeNull();
  expect(
    readLocalDraft({ ...input, session: 'secret' }, scope, 1000001),
  ).toBeNull();
  expect(
    readLocalDraft(
      { ...input, definition: { ...input.definition, title: 'x'.repeat(121) } },
      scope,
      1000001,
    ),
  ).toBeNull();
  expect(localDraftKey(input)).not.toEqual(
    localDraftKey({ ...input, editorId: crypto.randomUUID() }),
  );
});
it('keeps an immutable retry body separate from later edits and rejects mismatched revisions', () => {
  const input = record();
  const pending = {
    operationId: crypto.randomUUID(),
    expectedRevision: 12,
    definition: structuredClone(input.definition),
  };
  input.definition.title = 'Later edit';
  const buffered = { ...input, pending };
  expect(
    readLocalDraft(buffered, scope, 1000001)?.pending?.definition.title,
  ).not.toBe('Later edit');
  expect(
    readLocalDraft(
      { ...buffered, pending: { ...pending, expectedRevision: 11 } },
      scope,
      1000001,
    ),
  ).toBeNull();
  expect(
    readLocalDraft({ ...buffered, backup: input.definition }, scope, 1000001)
      ?.backup,
  ).toEqual(input.definition);
});
