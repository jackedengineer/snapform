import { expect, it } from 'vitest';
import {
  publishFormSchema,
  unpublishFormSchema,
  publicationSchema,
  publicationReceiptSchema,
} from '../src/publication.ts';
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
