import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
const base = `http://127.0.0.1:5173/api/v1/workspaces/${crypto.randomUUID()}/deletions`;
const receipt = `${base}/${crypto.randomUUID()}`;
it('requires verified authentication for deletion scheduling, recovery and cancellation', async () => {
  for (const [url, method] of [
    [base, 'GET'],
    [receipt, 'GET'],
    [base, 'POST'],
    [`${receipt}/cancel`, 'POST'],
  ]) {
    const response = await SELF.fetch(url, {
      method,
      ...(method === 'POST'
        ? { headers: { 'Content-Type': 'application/json' }, body: '{}' }
        : {}),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
  }
});
it('bounds deletion writes and rejects wrong media, cross-origin and compressed bodies', async () => {
  for (const url of [base, `${receipt}/cancel`]) {
    expect(
      (await SELF.fetch(url, { method: 'POST', body: 'plain text' })).status,
    ).toBe(415);
    expect(
      (
        await SELF.fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmation: 'x'.repeat(17000) }),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await SELF.fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://foreign.invalid',
          },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await SELF.fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Encoding': 'gzip',
          },
          body: 'invalid',
        })
      ).status,
    ).toBe(415);
  }
});
