import { expect, it } from 'vitest';
import { formDefinitionSchema } from '@snapform/contracts/form';
import type { Workspace } from '@snapform/contracts/workspace';
import {
  guestDraftLifetime,
  importPlan,
  newGuestDraft,
  readGuestDraft,
} from './guest-draft';

const now = Date.UTC(2026, 10, 17, 12);

it('starts a valid draft from a starter or a blank form, with ids reserved', () => {
  for (const starter of [
    'agency',
    'coach',
    'consultant',
    'startup',
    'blank',
  ] as const) {
    const draft = newGuestDraft(starter, now);
    expect(formDefinitionSchema.safeParse(draft.definition).success).toBe(true);
    expect(draft.definition.presentation).toBe('card');
    expect(draft.formId).not.toBe(draft.workspaceId);
    expect(draft.segment).toBe(starter === 'blank' ? 'agency' : starter);
    expect(draft.business).toBe('');
  }
});

it('reads back only a well-formed, recent draft', () => {
  const draft = {
    ...newGuestDraft('agency', now),
    business: 'Northwind Studio',
  };
  expect(readGuestDraft(JSON.stringify(draft), now)).toEqual(draft);
  expect(
    readGuestDraft(JSON.stringify(draft), now + guestDraftLifetime),
  ).toBeNull();
  expect(
    readGuestDraft(JSON.stringify({ ...draft, updatedAt: now + 60_000 }), now),
  ).toBeNull();
  for (const raw of [
    null,
    '',
    '{',
    '[]',
    JSON.stringify({ ...draft, version: 2 }),
  ])
    expect(readGuestDraft(raw, now)).toBeNull();
  const tampered = structuredClone(draft);
  tampered.definition.pages = [];
  expect(readGuestDraft(JSON.stringify(tampered), now)).toBeNull();
  expect(
    readGuestDraft(JSON.stringify({ ...draft, extra: '<script>' }), now),
  ).toBeNull();
});

const workspace = (role: Workspace['role']): Workspace => ({
  id: crypto.randomUUID(),
  name: 'Existing studio',
  segment: 'agency',
  role,
});

it('creates the business as a workspace for a new account', () => {
  const draft = {
    ...newGuestDraft('coach', now),
    business: '  Bright Coaching  ',
  };
  expect(importPlan(draft, [])).toEqual({
    kind: 'create',
    workspace: {
      id: draft.workspaceId,
      name: 'Bright Coaching',
      segment: 'coach',
    },
  });
});

it('adds the form to a workspace the person can edit, if they have one', () => {
  const draft = { ...newGuestDraft('agency', now), business: 'Northwind' };
  const viewer = workspace('viewer');
  const editor = workspace('editor');
  expect(importPlan(draft, [viewer, editor])).toEqual({
    kind: 'existing',
    workspaceId: editor.id,
  });
  expect(importPlan(draft, [viewer]).kind).toBe('create');
});

it('falls back to a plain name when the business was left out', () => {
  const draft = newGuestDraft('startup', now);
  const plan = importPlan(draft, []);
  expect(plan.kind === 'create' && plan.workspace.name).toBe('My workspace');
});
