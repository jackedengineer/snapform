import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
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
    (await SELF.fetch(draft, { method: 'PUT', body: 'text' })).status,
  ).toBe(415);
  expect(
    (
      await SELF.fetch(draft, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
