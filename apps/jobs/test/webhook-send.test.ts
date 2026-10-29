import { expect, it, vi } from 'vitest';
import { sendWebhook } from '../src/webhook-send';
import {
  createWebhookSecret,
  verifyWebhook,
} from '@snapform/contracts/webhook-crypto';
const now = Date.parse('2026-10-30T00:00:00Z');
const delivery = {
  id: crypto.randomUUID(),
  url: 'https://hooks.example.com/intake',
  secret: createWebhookSecret(),
  body: '{"zero":0,"confirmed":false}\n',
  attempts: 1,
};
it('posts exact bytes and stable identity with native standard signatures, fixed headers and no redirects', async () => {
  const requests: Request[] = [];
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    requests.push(new Request(url, init));
    return new Response(null, { status: 204 });
  });
  expect(await sendWebhook(delivery, now, transport, 0)).toEqual({
    status: 'acknowledged',
    httpStatus: 204,
  });
  expect(
    await sendWebhook({ ...delivery, attempts: 2 }, now + 60000, transport, 0),
  ).toEqual({ status: 'acknowledged', httpStatus: 204 });
  for (const request of requests) {
    expect(request.url).toBe(delivery.url);
    expect(request.method).toBe('POST');
    expect(request.redirect).toBe('manual');
    const body = await request.text();
    expect(body).toBe(delivery.body);
    expect(request.headers.get('webhook-id')).toBe(delivery.id);
    expect(
      await verifyWebhook(
        body,
        {
          id: request.headers.get('webhook-id') ?? '',
          timestamp: request.headers.get('webhook-timestamp') ?? '',
          signature: request.headers.get('webhook-signature') ?? '',
        },
        delivery.secret,
        now + 60000,
      ),
    ).toBe(true);
    expect([...request.headers.keys()].sort()).toEqual([
      'content-type',
      'user-agent',
      'webhook-id',
      'webhook-signature',
      'webhook-timestamp',
    ]);
  }
  expect(requests[0].headers.get('webhook-timestamp')).not.toBe(
    requests[1].headers.get('webhook-timestamp'),
  );
});
it('stops redirects and authorization failures while bounding jitter and honoring Retry-After', async () => {
  for (const [status, reason] of [
    [302, 'redirect-blocked'],
    [401, 'authorization'],
    [403, 'authorization'],
    [422, 'receiver-rejected'],
  ] as const)
    expect(
      await sendWebhook(
        delivery,
        now,
        async () => new Response('private', { status }),
        0,
      ),
    ).toEqual({ status: 'needs_action', httpStatus: status, reason });
  expect(
    await sendWebhook(
      delivery,
      now,
      async () =>
        new Response(null, { status: 429, headers: { 'Retry-After': '120' } }),
      0.5,
    ),
  ).toEqual({
    status: 'retry',
    httpStatus: 429,
    reason: 'rate-limited',
    delaySeconds: 120,
  });
  expect(
    await sendWebhook(
      delivery,
      now,
      async () => new Response(null, { status: 503 }),
      0.5,
    ),
  ).toEqual({
    status: 'retry',
    httpStatus: 503,
    reason: 'receiver-unavailable',
    delaySeconds: 75,
  });
  expect(
    await sendWebhook(
      delivery,
      now,
      async () =>
        new Response(null, {
          status: 503,
          headers: { 'Retry-After': new Date(now + 180000).toUTCString() },
        }),
      0,
    ),
  ).toMatchObject({ status: 'retry', delaySeconds: 180 });
  expect(
    await sendWebhook(
      delivery,
      now,
      async () =>
        new Response(null, {
          status: 429,
          headers: { 'Retry-After': '172800' },
        }),
      0,
    ),
  ).toMatchObject({ status: 'needs_action', reason: 'retry-later' });
  expect(
    await sendWebhook(
      { ...delivery, attempts: 8 },
      now,
      async () => new Response(null, { status: 500 }),
      0,
    ),
  ).toMatchObject({ status: 'needs_action', reason: 'attempts-exhausted' });
});
it('keeps ambiguous timeouts/network errors unknown and rejects unsafe configuration before network I/O', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValue(Error('private receiver diagnostic'));
  expect(await sendWebhook(delivery, now, transport, 0)).toEqual({
    status: 'unknown',
    reason: 'receiver-unconfirmed',
    httpStatus: null,
  });
  expect(
    await sendWebhook(
      delivery,
      now,
      async () => new Response(null, { status: 408 }),
      0,
    ),
  ).toEqual({
    status: 'unknown',
    reason: 'receiver-unconfirmed',
    httpStatus: 408,
  });
  transport.mockClear();
  for (const item of [
    { ...delivery, url: 'https://127.0.0.1/' },
    { ...delivery, secret: 'private-invalid' },
    { ...delivery, attempts: 9 },
  ])
    expect(await sendWebhook(item, now, transport, 0)).toEqual({
      status: 'needs_action',
      reason: 'configuration',
      httpStatus: null,
    });
  expect(transport).not.toHaveBeenCalled();
});
it('pauses rather than ignoring a long numeric Retry-After', async () => {
  expect(
    await sendWebhook(
      delivery,
      now,
      async () =>
        new Response(null, {
          status: 429,
          headers: { 'Retry-After': '123456789' },
        }),
      0,
    ),
  ).toMatchObject({ status: 'needs_action', reason: 'retry-later' });
});
