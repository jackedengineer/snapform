import { SELF, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { matchPublicFormRoute } from '../src/public-form.ts';
const id = crypto.randomUUID(),
  path = `/api/v1/public/forms/${id}`;
const url = `http://127.0.0.1:5173${path}`;
it('recognizes only an exact public identity without accepting private scopes', () => {
  expect(matchPublicFormRoute(path)).toBe(id);
  expect(matchPublicFormRoute(path + '/')).toBeNull();
  expect(matchPublicFormRoute(path.replace(id, 'unknown'))).toBeNull();
});
it('returns an uncached missing form without requiring account authentication', async () => {
  const response = await SELF.fetch(url);
  expect(response.status).toBe(404);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    error: { code: 'FORM_UNAVAILABLE' },
  });
  const wrongMethod = await SELF.fetch(url, { method: 'POST' });
  expect(wrongMethod.status).toBe(405);
  expect(wrongMethod.headers.get('Allow')).toBe('GET');
});
it('enforces the native public read limit before opening a database', async () => {
  const key = '198.51.100.42';
  for (let i = 0; i < 60; i++) await env.PUBLIC_READ_RATE_LIMIT.limit({ key });
  const response = await SELF.fetch(url, {
    headers: { 'cf-connecting-ip': key },
  });
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
});
