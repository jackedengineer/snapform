import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
const path = `http://127.0.0.1:5173/api/v1/workspaces/${crypto.randomUUID()}/forms/${crypto.randomUUID()}/webhook`;
it('requires verified authentication and no-store for endpoint settings and key reveal', async () => {
  for (const [url, method] of [
    [path, 'GET'],
    [path, 'PUT'],
    [path, 'PATCH'],
    [path + '/secret', 'POST'],
    [path + '/preview', 'POST'],
    [path + '/send', 'POST'],
    [path + '/deliveries', 'GET'],
  ]) {
    const response = await SELF.fetch(url, {
      method,
      ...(method === 'GET'
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
  }
});
it('keeps delivery controls behind the same bounded JSON and origin boundary', async () => {
  for (const [url, method] of [
    [path, 'PATCH'],
    [path + '/preview', 'POST'],
    [path + '/send', 'POST'],
  ]) {
    expect((await SELF.fetch(url, { method, body: 'text' })).status).toBe(415);
    expect(
      (
        await SELF.fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: 'x'.repeat(17000) }),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await SELF.fetch(url, {
          method,
          headers: {
            Origin: 'https://evil.test',
            'Content-Type': 'application/json',
          },
          body: '{}',
        })
      ).status,
    ).toBe(403);
  }
  expect(
    (
      await SELF.fetch('http://127.0.0.1:5173/api/v1/dispatch/webhooks', {
        method: 'POST',
        body: '{}',
      })
    ).status,
  ).toBe(404);
});
it('bounds webhook configuration bodies and rejects cross-origin or non-JSON writes', async () => {
  expect((await SELF.fetch(path, { method: 'PUT', body: 'text' })).status).toBe(
    415,
  );
  expect(
    (
      await SELF.fetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'x'.repeat(17000) }),
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await SELF.fetch(path + '/secret', {
        method: 'POST',
        headers: {
          Origin: 'https://evil.test',
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    ).status,
  ).toBe(403);
});
