import { expect, it } from 'vitest';
import {
  publishFormSchema,
  unpublishFormSchema,
  publicationSchema,
  publicationReceiptSchema,
  compilePublication,
} from '../src/publication.ts';
import { compileDefinition } from '../src/compile.ts';
import { formFixture } from './form-fixture.ts';
it('accepts only stable publication identity and an exact bounded source revision', () => {
  const input = { versionId: crypto.randomUUID(), expectedRevision: 12 };
  expect(publishFormSchema.parse(input)).toEqual(input);
  for (const expectedRevision of [0, -1, 1.5, 2147483648])
    expect(
      publishFormSchema.safeParse({ ...input, expectedRevision }).success,
    ).toBe(false);
  expect(
    publishFormSchema.safeParse({ ...input, definition: {} }).success,
  ).toBe(false);
  expect(
    unpublishFormSchema.safeParse({ expectedVersionId: input.versionId })
      .success,
  ).toBe(true);
  expect(
    unpublishFormSchema.safeParse({ expectedVersionId: 'latest' }).success,
  ).toBe(false);
});
it('keeps the original receipt distinct from a newer live snapshot', () => {
  const oldId = crypto.randomUUID(),
    currentId = crypto.randomUUID();
  const receipt = publicationReceiptSchema.parse({
    versionId: oldId,
    number: 1,
    sourceRevision: 12,
    publication: {
      publicId: crypto.randomUUID(),
      versionId: currentId,
      number: 2,
      sourceRevision: 13,
      active: true,
      updatedAt: '2026-10-29T00:00:00.000Z',
    },
  });
  expect(receipt.versionId).toBe(oldId);
  expect(receipt.publication?.versionId).toBe(currentId);
});
it('requires explicit live state and a real snapshot reference', () => {
  const state = {
    publicId: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    number: 1,
    sourceRevision: 12,
    active: false,
    updatedAt: '2026-10-29T00:00:00.000Z',
  };
  expect(publicationSchema.parse(state)).toEqual(state);
  expect(
    publicationSchema.safeParse({ ...state, active: 'true' }).success,
  ).toBe(false);
  expect(publicationSchema.safeParse({ ...state, number: 0 }).success).toBe(
    false,
  );
});
function withFileQuestion() {
  const { definition } = formFixture();
  const file = {
    id: crypto.randomUUID(),
    type: 'file',
    label: 'Upload your brief',
    description: '',
    required: false,
    aiEnabled: false,
    maxFiles: 1,
  } as const;
  definition.pages[0].blocks.push(file);
  return { definition, fileId: file.id };
}
it('refuses to publish file questions the public form cannot collect', () => {
  expect(compilePublication(formFixture().definition).ok).toBe(true);
  const { definition, fileId } = withFileQuestion();
  expect(compileDefinition(definition).ok).toBe(true);
  expect(compilePublication(definition)).toEqual({
    ok: false,
    issues: [
      {
        code: 'FILE_COLLECTION_UNAVAILABLE',
        message:
          'File upload isn’t available yet. Remove this question to publish.',
        targetId: fileId,
      },
    ],
  });
});
it('lists file questions with the other publishing issues', () => {
  const { definition, fileId } = withFileQuestion();
  const result = compilePublication({ ...definition, title: ' ' });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected publishing issues');
  expect(result.issues.map((issue) => [issue.code, issue.targetId])).toEqual([
    ['MISSING_TITLE', undefined],
    ['FILE_COLLECTION_UNAVAILABLE', fileId],
  ]);
  const malformed = compilePublication({ ...definition, pages: 'none' });
  expect(malformed.ok).toBe(false);
  if (!malformed.ok)
    expect(
      malformed.issues.every((issue) => issue.code === 'INVALID_DEFINITION'),
    ).toBe(true);
});
