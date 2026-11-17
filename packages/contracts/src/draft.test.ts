import { expect, it } from 'vitest';
import {
  createFormSchema,
  saveDraftSchema,
  draftReceiptSchema,
  formCursorSchema,
  formsPageSchema,
  formStatus,
  formListResponseLimit,
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
it('preserves database cursor microseconds and rejects malformed cursors', () => {
  const value = {
    id: crypto.randomUUID(),
    createdAt: '2026-10-28T12:34:56.123456Z',
  };
  expect(formCursorSchema.parse(value)).toEqual(value);
  expect(
    formCursorSchema.safeParse({ ...value, createdAt: 'yesterday' }).success,
  ).toBe(false);
});
it('lists each form with its collection status and a bounded response count', () => {
  const item = {
    id: crypto.randomUUID(),
    title: 'Project enquiry',
    revision: 3,
    updatedAt: '2026-11-12T09:30:00.000Z',
    status: 'live',
    responseCount: 12,
  };
  const page = {
    workspace: {
      id: crypto.randomUUID(),
      name: 'QA Agency',
      segment: 'agency',
      role: 'editor',
    },
    forms: [item],
    nextCursor: null,
  };
  expect(formsPageSchema.parse(page)).toEqual(page);
  expect(formListResponseLimit).toBe(1000);
  for (const changed of [
    { status: 'archived' },
    { status: undefined },
    { responseCount: -1 },
    { responseCount: 1.5 },
    { responseCount: formListResponseLimit + 1 },
    { responseCount: undefined },
  ])
    expect(
      formsPageSchema.safeParse({ ...page, forms: [{ ...item, ...changed }] })
        .success,
    ).toBe(false);
});
it('derives draft, live and stopped from the publication flag', () => {
  expect(formStatus(null)).toBe('draft');
  expect(formStatus(true)).toBe('live');
  expect(formStatus(false)).toBe('stopped');
});
