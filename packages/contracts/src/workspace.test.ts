import { describe, expect, it } from 'vitest';
import { can, createWorkspaceSchema } from './workspace.ts';

describe('workspace policy', () => {
  it('limits viewers to reading and editors to the operational workflow', () => {
    expect(can('viewer', 'responses.read')).toBe(true);
    for (const action of [
      'forms.write',
      'responses.export',
      'integrations.manage',
      'members.manage',
      'billing.manage',
      'workspace.delete',
    ])
      expect(can('viewer', action)).toBe(false);
    for (const action of [
      'responses.read',
      'forms.write',
      'responses.export',
      'integrations.manage',
    ])
      expect(can('editor', action)).toBe(true);
    for (const action of [
      'members.manage',
      'billing.manage',
      'workspace.delete',
    ]) {
      expect(can('editor', action)).toBe(false);
      expect(can('owner', action)).toBe(true);
    }
  });
  it('fails closed on unknown roles/actions and prototype names', () => {
    for (const role of ['admin', '__proto__', null, undefined])
      expect(can(role, 'responses.read')).toBe(false);
    for (const action of ['unknown', '__proto__', null])
      expect(can('owner', action)).toBe(false);
  });
  it('bounds creation and rejects a client-supplied owner identity', () => {
    const value = {
      id: crypto.randomUUID(),
      name: '  Studio QA  ',
      segment: 'agency',
    };
    expect(createWorkspaceSchema.parse(value)).toEqual({
      ...value,
      name: 'Studio QA',
    });
    for (const input of [
      { ...value, name: ' ' },
      { ...value, name: 'A\0B' },
      { ...value, name: 'A\ud800B' },
      { ...value, name: 'x'.repeat(81) },
      { ...value, id: 'invalid' },
      { ...value, ownerId: 'forged' },
      { ...value, segment: 'enterprise' },
    ])
      expect(createWorkspaceSchema.safeParse(input).success).toBe(false);
  });
  it('normalizes UUID casing and uses the database character minimum', () => {
    const value = {
      id: crypto.randomUUID(),
      name: 'Studio QA',
      segment: 'agency',
    };
    expect(
      createWorkspaceSchema.parse({ ...value, id: value.id.toUpperCase() }).id,
    ).toBe(value.id);
    expect(
      createWorkspaceSchema.safeParse({ ...value, name: '🙂' }).success,
    ).toBe(false);
  });
});
