import { expect, it } from 'vitest';
import {
  createFormSchema,
  saveDraftSchema,
  draftReceiptSchema,
} from './draft.ts';
import { formFixture } from '../test/form-fixture.ts';
it('requires a typed definition, stable identity and bounded expected revision', () => {
  const { definition } = formFixture();
  const id = crypto.randomUUID();
  expect(createFormSchema.safeParse({ id, definition }).success).toBe(true);
  const save = { operationId: id, expectedRevision: 1, definition };
  expect(saveDraftSchema.safeParse(save).success).toBe(true);
  for (const input of [
    { ...save, expectedRevision: 0 },
    { ...save, expectedRevision: 1.5 },
    { ...save, expectedRevision: 2147483647 },
    { ...save, ownerId: 'forged' },
    { ...save, definition: {} },
    { ...save, operationId: 'invalid' },
  ])
    expect(saveDraftSchema.safeParse(input).success).toBe(false);
  expect(
    createFormSchema.safeParse({
      id,
      definition,
      workspaceId: crypto.randomUUID(),
    }).success,
  ).toBe(false);
});
it('never acknowledges an operation beyond the current persisted revision', () => {
  const value = {
    id: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    revision: 2,
    currentRevision: 3,
  };
  expect(draftReceiptSchema.safeParse(value).success).toBe(true);
  expect(
    draftReceiptSchema.safeParse({ ...value, currentRevision: 1 }).success,
  ).toBe(false);
});
