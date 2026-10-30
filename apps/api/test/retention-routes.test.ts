import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
const path = `https://snapform.jacked.dev/api/v1/workspaces/${crypto.randomUUID()}/retention`;
it('requires verified authentication before reading or changing retention', async () => {
  for (const method of ['GET', 'PUT']) {
    const result = await SELF.fetch(path + '?role=owner', {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'snapform.session_token=forged',
      },
      ...(method === 'PUT'
        ? {
            body: JSON.stringify({
              days: 30,
              expectedRevision: 0,
              acknowledgeDeletion: true,
            }),
          }
        : {}),
    });
    expect(result.status).toBe(401);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(await result.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } });
  }
});
it('bounds retention bodies and blocks cross-origin writes before database work', async () => {
  expect(
    (await SELF.fetch(path, { method: 'PUT', body: 'plain' })).status,
  ).toBe(415);
  expect(
    (
      await SELF.fetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 'x'.repeat(20000) }),
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await SELF.fetch(path, {
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
