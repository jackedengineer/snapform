import { SELF } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { handleProviderReceipt } from '../src/provider-receipt';
const secret = 'whsec_MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const url = 'https://snapform.jacked.dev/api/v1/hooks/resend';
const deliveryId = crypto.randomUUID(),
  providerId = crypto.randomUUID();
const payload = {
  type: 'email.delivered',
  created_at: new Date().toISOString(),
  data: {
    email_id: providerId,
    to: ['qa@example.invalid'],
    tags: { snapform_delivery: deliveryId },
    subject: 'must never be reflected',
  },
};
async function signed(value: unknown) {
  const body = JSON.stringify(value),
    timestamp = String(Math.floor(Date.now() / 1000)),
    id = 'msg_synthetic';
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(secret.slice(6)), (x) => x.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${body}`),
    ),
  );
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': 'v1,' + btoa(String.fromCharCode(...digest)),
    },
    body,
  });
}
it('projects only verified delivery metadata and acknowledges recorded or duplicate results', async () => {
  const record = vi.fn(async () => true);
  expect(
    (await handleProviderReceipt(await signed(payload), secret, record)).status,
  ).toBe(204);
  expect(record.mock.calls).toEqual([
    [
      {
        deliveryId,
        providerId,
        recipient: 'qa@example.invalid',
        status: 'delivered',
      },
    ],
  ]);
  expect(
    (
      await handleProviderReceipt(
        await signed(payload),
        secret,
        async () => false,
      )
    ).status,
  ).toBe(204);
});
it('ignores unrelated signed mail and rejects malformed tagged events without storage', async () => {
  const record = vi.fn(async () => true);
  expect(
    (
      await handleProviderReceipt(
        await signed({ ...payload, data: { ...payload.data, tags: {} } }),
        secret,
        record,
      )
    ).status,
  ).toBe(204);
  expect(
    (
      await handleProviderReceipt(
        await signed({ ...payload, type: 'contact.created' }),
        secret,
        record,
      )
    ).status,
  ).toBe(204);
  expect(
    (
      await handleProviderReceipt(
        await signed({
          ...payload,
          data: { ...payload.data, email_id: 'invalid' },
        }),
        secret,
        record,
      )
    ).status,
  ).toBe(400);
  expect(record).not.toHaveBeenCalled();
});
it('rejects bad methods, media types, oversized bytes and invalid signatures before storage', async () => {
  const record = vi.fn(async () => true);
  expect(
    (await handleProviderReceipt(new Request(url), secret, record)).status,
  ).toBe(405);
  expect(
    (await handleProviderReceipt(await signed(payload), '', record)).status,
  ).toBe(503);
  expect(
    (
      await handleProviderReceipt(
        new Request(url, { method: 'POST', body: '{}' }),
        secret,
        record,
      )
    ).status,
  ).toBe(415);
  expect(
    (
      await handleProviderReceipt(
        new Request(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'x'.repeat(32769),
        }),
        secret,
        record,
      )
    ).status,
  ).toBe(413);
  const request = await signed(payload);
  request.headers.set('svix-signature', 'v1,forged');
  expect((await handleProviderReceipt(request, secret, record)).status).toBe(
    401,
  );
  expect(record).not.toHaveBeenCalled();
});
it('returns a retryable sanitized failure when persistence is unavailable', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await handleProviderReceipt(
      await signed(payload),
      secret,
      async () => {
        throw Error('private synthetic diagnostic');
      },
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private synthetic diagnostic');
    expect(logged.mock.calls).toEqual([
      [JSON.stringify({ event: 'provider_receipt_record_failed' })],
    ]);
  } finally {
    logged.mockRestore();
  }
});
it('rejects forged requests at the real private Worker boundary without a database', async () => {
  const response = await SELF.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  expect(response.status).toBe(401);
});
