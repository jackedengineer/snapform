import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('exposes bounded liveness without environment or database details', async () => {
  const response = await SELF.fetch(
    'https://snapform.jacked.dev/api/v1/health',
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Request-Id')).toMatch(/^[a-f0-9-]{36}$/);
});
