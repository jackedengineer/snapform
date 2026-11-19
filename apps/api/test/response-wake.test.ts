import { expect, it, vi } from 'vitest';
import { wakeResponseDelivery } from '../src/response-wake';

it('wakes Jobs through a fresh private request right after a submit', async () => {
  const requests: Request[] = [];
  const fetcher = vi.fn<Fetcher['fetch']>(async (input) => {
    requests.push(new Request(input));
    return new Response(null, { status: 200 });
  });
  await wakeResponseDelivery({ fetch: fetcher });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(requests[0].url).toBe('https://jobs.internal/dispatch/responses');
  expect(requests[0].method).toBe('POST');
  expect(requests[0].redirect).toBe('manual');
  expect([...requests[0].headers.keys()]).toEqual(['content-type']);
  expect(await requests[0].json()).toEqual({ version: 1 });
});

it('leaves a failed wake to the 30-minute sweep and logs no service detail', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const fetcher of [
      vi.fn<Fetcher['fetch']>(
        async () => new Response('private diagnostic', { status: 503 }),
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
      await expect(wakeResponseDelivery({ fetch: fetcher })).resolves.toBe(
        undefined,
      );
      expect(fetcher).toHaveBeenCalledOnce();
    }
    expect(logged.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [
        JSON.stringify({ event: 'response_wake_unavailable' }),
      ]),
    );
  } finally {
    logged.mockRestore();
  }
});
