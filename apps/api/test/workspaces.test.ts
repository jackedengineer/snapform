import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
const url = 'http://127.0.0.1:5173/api/v1/workspaces';
it('requires a verified session for workspace listing and creation', async () => {
  for (const cookie of ['', 'snapform.session_token=forged']) {
    const response = await SELF.fetch(url, { headers: { Cookie: cookie } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
  }
  expect(
    (
      await SELF.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(401);
});
it('bounds private JSON before database work', async () => {
  expect(
    (
      await SELF.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x'.repeat(20000) }),
      })
    ).status,
  ).toBe(413);
  expect(
    (await SELF.fetch(url, { method: 'POST', body: 'plain' })).status,
  ).toBe(415);
});
it('blocks cross-origin private mutations for every unsafe method', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT'])
    expect(
      (
        await SELF.fetch(url, {
          method,
          headers: { Origin: 'https://evil.test' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
});
