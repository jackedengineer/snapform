import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { formsPageBody } from '../src/forms.ts';
import { sessionCookie } from './session-cookie.ts';
it('serializes list status and bounded response counts inside workerd', () => {
  const workspace = {
    id: crypto.randomUUID(),
    name: 'QA Agency',
    segment: 'agency' as const,
    role: 'viewer' as const,
  };
  const item = {
    id: crypto.randomUUID(),
    title: 'Project enquiry',
    revision: 4,
    updatedAt: new Date('2026-11-12T09:30:00.000Z'),
    status: 'stopped' as const,
    responseCount: 1000,
  };
  const cursor = { createdAt: '2026-11-01T00:00:00.123456Z', id: item.id };
  const body = formsPageBody({ workspace, forms: [item], nextCursor: cursor });
  expect(body.forms).toEqual([
    { ...item, updatedAt: '2026-11-12T09:30:00.000Z' },
  ]);
  expect(body.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(
    JSON.parse(
      atob((body.nextCursor || '').replace(/-/g, '+').replace(/_/g, '/')),
    ),
  ).toEqual(cursor);
  for (const changed of [{ responseCount: 1001 }, { responseCount: -1 }])
    expect(() =>
      formsPageBody({
        workspace,
        forms: [{ ...item, ...changed }],
        nextCursor: null,
      }),
    ).toThrow();
});
const base = `http://127.0.0.1:5173/api/v1/workspaces/${crypto.randomUUID()}/forms`;
const draft = `${base}/${crypto.randomUUID()}/draft`;
it('requires a verified identity for every form resource', async () => {
  for (const url of [base, draft]) {
    const response = await SELF.fetch(url);
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  for (const [url, method] of [
    [base, 'POST'],
    [draft, 'PUT'],
  ]) {
    const response = await SELF.fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  }
});
it('bounds authoring bodies and rejects non-JSON or cross-origin writes', async () => {
  expect(
    (
      await SELF.fetch(draft, {
        method: 'PUT',
        headers: { Cookie: sessionCookie },
        body: 'text',
      })
    ).status,
  ).toBe(415);
  expect(
    (
      await SELF.fetch(draft, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
        body: JSON.stringify({ value: 'x'.repeat(310000) }),
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await SELF.fetch(draft, {
        method: 'PUT',
        headers: {
          Origin: 'https://evil.test',
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    ).status,
  ).toBe(403);
});
