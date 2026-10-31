import { expect, it } from 'vitest';
import { can } from '../src/workspace.ts';

it('allows integration inspection for owners and editors while keeping viewers out', () => {
  expect(can('owner', 'integrations.read')).toBe(true);
  expect(can('editor', 'integrations.read')).toBe(true);
  expect(can('viewer', 'integrations.read')).toBe(false);
});
