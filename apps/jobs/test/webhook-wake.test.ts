import { SELF } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { handleWebhookWake } from '../src/webhook-wake';
const url = 'https://jobs.internal/dispatch/webhooks';
const id = crypto.randomUUID();
const request = (
  body = JSON.stringify({ version: 1, eventId: id }),
  headers = {},
) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
it('passes only a validated delivery identity and returns sanitized completion metadata', async () => {
  const dispatch = vi.fn(async () => ({
    claimed: 1,
    acknowledged: 1,
    failed: 0,
  }));
  const response = await handleWebhookWake(request(), dispatch);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    claimed: 1,
    acknowledged: 1,
    failed: 0,
  });
  expect(dispatch).toHaveBeenCalledWith(id);
});
it('rejects methods, query overrides, encodings, malformed and oversized input before dispatch', async () => {
  const dispatch = vi.fn();
  for (const [input, status] of [
    [new Request(url), 405],
    [new Request(url + '?eventId=other', request()), 422],
    [request('{}', { 'Content-Type': 'text/plain' }), 415],
    [request('{}', { 'Content-Encoding': 'gzip' }), 415],
    [request('not-json'), 422],
    [
      request(
        JSON.stringify({
          version: 1,
          eventId: id,
          destination: 'https://127.0.0.1',
        }),
      ),
      422,
    ],
    [request(JSON.stringify({ version: 1, eventId: 'invalid' })), 422],
    [request(' '.repeat(513)), 413],
  ] as const)
    expect((await handleWebhookWake(input, dispatch)).status).toBe(status);
  expect(dispatch).not.toHaveBeenCalled();
});
it('returns retryable failures without reflecting private diagnostics or claiming delivery', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await handleWebhookWake(request(), async () => {
      throw Error('private database capability');
    });
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('');
    expect(logged.mock.calls).toEqual([
      [JSON.stringify({ event: 'webhook_wake_failed' })],
    ]);
    expect(
      (
        await handleWebhookWake(request(), async () => ({
          claimed: 1,
          acknowledged: 0,
          failed: 1,
        }))
      ).status,
    ).toBe(503);
  } finally {
    logged.mockRestore();
  }
});
it('enforces the private Worker route and fails closed without a real database configuration', async () => {
  expect((await SELF.fetch(url)).status).toBe(405);
  expect((await SELF.fetch(request())).status).toBe(503);
  expect((await SELF.fetch(request(' '.repeat(513)))).status).toBe(413);
});
it('rejects a failed request stream without leaking its diagnostic or dispatching', async () => {
  const dispatch = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(Error('private stream diagnostic'));
    },
  });
  const response = await handleWebhookWake(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
    dispatch,
  );
  expect(response.status).toBe(422);
  expect(await response.text()).toBe('');
  expect(dispatch).not.toHaveBeenCalled();
});
