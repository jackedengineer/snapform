import { SELF } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { handleResponseWake } from '../src/response-wake';
const url = 'https://jobs.internal/dispatch/responses';
const request = (
  body: string | null = JSON.stringify({ version: 1 }),
  headers: Record<string, string> = {},
  target = url,
) =>
  new Request(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
const delivered = { events: 1, emails: 1, webhooks: 0, failed: 0 };

it('runs response delivery once for a well-formed private wake', async () => {
  const dispatch = vi.fn(async () => delivered);
  const response = await handleResponseWake(request(), dispatch);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual(delivered);
  expect(dispatch).toHaveBeenCalledOnce();
});

it('refuses anything but a small JSON POST without running delivery', async () => {
  const dispatch = vi.fn(async () => delivered);
  const get = await handleResponseWake(new Request(url), dispatch);
  expect(get.status).toBe(405);
  expect(get.headers.get('Allow')).toBe('POST');
  for (const [candidate, status] of [
    [request(undefined, {}, url + '?all=1'), 422],
    [request(undefined, { 'Content-Type': 'text/plain' }), 415],
    [request(undefined, { 'Content-Encoding': 'gzip' }), 415],
    [request('x'.repeat(65)), 413],
    [request(JSON.stringify({ version: 2 })), 422],
    [request('{}'), 422],
    [request('not json'), 422],
    [request(null), 422],
  ] as const)
    expect((await handleResponseWake(candidate, dispatch)).status).toBe(status);
  expect(dispatch).not.toHaveBeenCalled();
});

it('answers 503 with a fixed log when delivery fails, leaving work to the sweep', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const partial = await handleResponseWake(
      request(),
      vi.fn(async () => ({ ...delivered, failed: 1 })),
    );
    expect(partial.status).toBe(503);
    expect(partial.headers.get('Retry-After')).toBe('60');
    const thrown = await handleResponseWake(
      request(),
      vi.fn(async () => {
        throw Error('private database detail');
      }),
    );
    expect(thrown.status).toBe(503);
    expect(await thrown.text()).toBe('');
    expect(logged.mock.calls).toEqual(
      Array.from({ length: 2 }, () => [
        JSON.stringify({ event: 'response_wake_failed' }),
      ]),
    );
  } finally {
    logged.mockRestore();
  }
});

it('serves the wake only at its private Jobs path', async () => {
  const response = await SELF.fetch(url);
  expect(response.status).toBe(405);
  expect(
    (await SELF.fetch('https://jobs.internal/dispatch/other')).status,
  ).toBe(404);
});
