import { expect, it } from 'vitest';
import { decodeResponseCursor, encodeResponseCursor } from './responses.ts';
it('preserves database microseconds and identity in opaque response cursors', () => {
  const cursor = {
    createdAt: '2026-10-29T08:10:00.123456Z',
    id: crypto.randomUUID(),
  };
  const encoded = encodeResponseCursor(cursor);
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeResponseCursor(encoded ?? undefined)).toEqual(cursor);
  expect(decodeResponseCursor()).toBeUndefined();
  expect(encodeResponseCursor(null)).toBeNull();
});
it('rejects malformed, oversized and capability-bearing cursors', () => {
  for (const token of [
    '',
    'bad-json',
    'x'.repeat(513),
    btoa(
      JSON.stringify({
        createdAt: '2026-10-29T00:00:00Z',
        id: crypto.randomUUID(),
        capability: 'forged',
      }),
    ),
  ])
    expect(() => decodeResponseCursor(token)).toThrow();
});
