import { expect, it, vi } from 'vitest';
import { sendOwnerEmail } from '../src/owner-email';
const now = Date.parse('2026-10-29T12:00:00Z');
const delivery = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  formId: '33333333-3333-4333-8333-333333333333',
  sessionId: '44444444-4444-4444-8444-444444444444',
  recipient: 'owner@example.invalid',
  firstAttemptAt: new Date(now).toISOString(),
};
const settings = {
  apiKey: 'synthetic',
  from: 'Snapform <no-reply@jacked.dev>',
};
const providerId = '55555555-5555-4555-8555-555555555555';
it('sends stable minimal plaintext to the verified snapshot recipient with an idempotency key', async () => {
  const calls: Request[] = [];
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    calls.push(new Request(url, init));
    return Response.json({ id: providerId });
  });
  for (let i = 0; i < 2; i++)
    expect(await sendOwnerEmail(delivery, settings, now, transport)).toEqual({
      status: 'accepted',
      providerId,
    });
  expect(calls[0].url).toBe('https://api.resend.com/emails');
  expect(calls[0].redirect).toBe('manual');
  expect(calls[0].headers.get('Idempotency-Key')).toBe(
    `response-owner-v1-${delivery.id}`,
  );
  const first = await calls[0].text();
  expect(first).toBe(await calls[1].text());
  const body = JSON.parse(first);
  expect(body.to).toEqual([delivery.recipient]);
  expect(body.text).toContain(
    `https://snapform.jacked.dev/workspaces/${delivery.workspaceId}/responses/${delivery.formId}?response=${delivery.sessionId}`,
  );
  expect(Object.keys(body).sort()).toEqual([
    'from',
    'subject',
    'tags',
    'text',
    'to',
  ]);
  expect(body.tags).toEqual([
    { name: 'snapform_delivery', value: delivery.id },
  ]);
  expect(body.text).not.toContain('answers');
});
it('never sends beyond the retry window or with missing configuration or an unauthorized test recipient', async () => {
  const transport = vi.fn<typeof fetch>();
  expect(
    await sendOwnerEmail(delivery, settings, now + 23 * 3600000, transport),
  ).toEqual({ status: 'needs_action', reason: 'idempotency-expired' });
  expect(
    await sendOwnerEmail(delivery, { ...settings, apiKey: '' }, now, transport),
  ).toEqual({ status: 'needs_action', reason: 'configuration' });
  expect(
    await sendOwnerEmail(
      delivery,
      { ...settings, allowedRecipient: 'qa@example.invalid' },
      now,
      transport,
    ),
  ).toEqual({ status: 'needs_action', reason: 'configuration' });
  expect(
    await sendOwnerEmail(
      {
        ...delivery,
        recipient: 'owner@example.invalid\r\nBcc: other@example.invalid',
      },
      settings,
      now,
      transport,
    ),
  ).toEqual({ status: 'needs_action', reason: 'configuration' });
  expect(transport).not.toHaveBeenCalled();
});
it('classifies transient and permanent failures without reflecting provider bodies', async () => {
  for (const status of [408, 429, 500, 503]) {
    const result = await sendOwnerEmail(
      delivery,
      settings,
      now,
      async () =>
        new Response('private diagnostic', {
          status,
          headers: { 'Retry-After': '999999' },
        }),
    );
    expect(result).toEqual({
      status: 'retry',
      reason: 'provider-unavailable',
      delaySeconds: 3600,
    });
  }
  expect(
    await sendOwnerEmail(delivery, settings, now, async () => {
      throw Error('private timeout');
    }),
  ).toEqual({
    status: 'retry',
    reason: 'provider-unavailable',
    delaySeconds: 60,
  });
  expect(
    await sendOwnerEmail(delivery, settings, now, async () =>
      Response.json(
        { name: 'concurrent_idempotent_requests' },
        { status: 409 },
      ),
    ),
  ).toEqual({
    status: 'retry',
    reason: 'provider-unavailable',
    delaySeconds: 60,
  });
  for (const status of [302, 400, 401, 403, 409, 422]) {
    expect(
      await sendOwnerEmail(
        delivery,
        settings,
        now,
        async () => new Response('private diagnostic', { status }),
      ),
    ).toEqual({ status: 'needs_action', reason: 'provider-rejected' });
  }
});
it('treats invalid successful responses as uncertain and retries the same key', async () => {
  for (const body of ['not json', '{"id":"not-an-id"}', '{}', 'x'.repeat(8193)])
    expect(
      await sendOwnerEmail(
        delivery,
        settings,
        now,
        async () => new Response(body),
      ),
    ).toEqual({
      status: 'retry',
      reason: 'provider-unavailable',
      delaySeconds: 60,
    });
});
