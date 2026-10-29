import { expect, it, vi } from 'vitest';
import { wakeWebhookDelivery } from '../src/webhooks';
it('wakes only a durable delivery UUID through a fresh private request', async () => {
  const id = crypto.randomUUID(),
    requests: Request[] = [];
  const fetcher = vi.fn<Fetcher['fetch']>(async (input) => {
    requests.push(new Request(input));
    return new Response(null, { status: 200 });
  });
  await wakeWebhookDelivery({ fetch: fetcher }, id);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(requests[0].url).toBe('https://jobs.internal/dispatch/webhooks');
  expect(requests[0].method).toBe('POST');
  expect(requests[0].redirect).toBe('manual');
  expect([...requests[0].headers.keys()]).toEqual(['content-type']);
  expect(await requests[0].json()).toEqual({ version: 1, eventId: id });
});
it('leaves failed wakes to durable Cron recovery and logs no service diagnostics', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const fetcher of [
      vi.fn<Fetcher['fetch']>(
        async () =>
          new Response('private provider diagnostic', { status: 503 }),
      ),
      vi.fn<Fetcher['fetch']>(async () => {
        throw Error('private service capability');
      }),
      vi.fn<Fetcher['fetch']>(
        async () =>
          new Response(null, {
            status: 302,
            headers: { Location: 'https://127.0.0.1/' },
          }),
      ),
    ]) {
      await expect(
        wakeWebhookDelivery({ fetch: fetcher }, crypto.randomUUID()),
      ).resolves.toBeUndefined();
      expect(fetcher).toHaveBeenCalledOnce();
    }
    expect(logged.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [
        JSON.stringify({ event: 'webhook_wake_unavailable' }),
      ]),
    );
  } finally {
    logged.mockRestore();
  }
});
