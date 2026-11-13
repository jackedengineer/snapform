import { expect, it } from 'vitest';
import { responseReference } from './reference';
it('derives a short grouped reference from the response session id', () => {
  expect(responseReference('3f9a1c2e-0b4d-4e8f-9a7b-112233445566')).toBe(
    '3F9A-1C2E',
  );
  expect(responseReference('3F9A1C2E-0B4D-4E8F-9A7B-112233445566')).toBe(
    '3F9A-1C2E',
  );
  const id = crypto.randomUUID(),
    reference = responseReference(id);
  expect(reference).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  expect(responseReference(id)).toBe(reference);
  expect(id.startsWith(reference.replace('-', '').toLowerCase())).toBe(true);
});
it('refuses values that are not a session identity', () => {
  for (const value of ['', 'not-a-session', '3f9a1c2e', 'g'.repeat(32)])
    expect(() => responseReference(value)).toThrow();
});
