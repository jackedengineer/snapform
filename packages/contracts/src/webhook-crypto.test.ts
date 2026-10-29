import { createHmac, createDecipheriv, createCipheriv } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  createWebhookSecret,
  signWebhook,
  verifyWebhook,
  sealWebhookDestination,
  openWebhookDestination,
} from './webhook-crypto.ts';
const secret =
  'whsec_' + Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const master = Buffer.alloc(32, 7).toString('base64');
const context = {
  workspaceId: 'abcdefab-cdef-4abc-8abc-abcdefabcdef',
  formId: '22222222-2222-4222-8222-222222222222',
  configurationId: '33333333-3333-4333-8333-333333333333',
};
const destination = {
  url: 'https://hooks.example.com/intake?token=synthetic',
  secret,
};
const id = '44444444-4444-4444-8444-444444444444',
  now = 1793298000000,
  body = '{"type":"snapform.test","zero":0}\n';
it('generates independent 256-bit keys and signs the exact event, timestamp and raw bytes', async () => {
  const a = createWebhookSecret(),
    b = createWebhookSecret();
  expect(a).not.toBe(b);
  expect(Buffer.from(a.slice(6), 'base64')).toHaveLength(32);
  const signed = await signWebhook(id, body, secret, now);
  expect(signed).toEqual({
    id,
    timestamp: String(now / 1000),
    signature:
      'v1,' +
      createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
        .update(`${id}.${now / 1000}.${body}`)
        .digest('base64'),
  });
  expect(await verifyWebhook(body, signed, secret, now)).toBe(true);
  expect(
    await verifyWebhook(
      body,
      { ...signed, signature: `v1,bad ${signed.signature}` },
      secret,
      now,
    ),
  ).toBe(true);
  expect(
    await verifyWebhook(
      body,
      { ...signed, signature: Array(9).fill(signed.signature).join(' ') },
      secret,
      now,
    ),
  ).toBe(false);
  expect(
    await verifyWebhook(
      body,
      {
        ...signed,
        signature: `v2,unknown v1,${'A'.repeat(42)}B= ${signed.signature}`,
      },
      secret,
      now,
    ),
  ).toBe(true);
  for (const headers of [
    { ...signed, id: context.formId },
    { ...signed, timestamp: String(now / 1000 - 301) },
    { ...signed, timestamp: String(now / 1000 + 301) },
    { ...signed, signature: 'v1,forged' },
    { ...signed, timestamp: '0' },
  ])
    expect(await verifyWebhook(body, headers, secret, now)).toBe(false);
  expect(await verifyWebhook(body + ' ', signed, secret, now)).toBe(false);
  expect(await verifyWebhook(body, signed, createWebhookSecret(), now)).toBe(
    false,
  );
});
it('bounds signing material and UTF-8 payloads without reflecting private input', async () => {
  for (const key of [
    'private-key',
    'whsec_bad',
    'whsec_' + Buffer.alloc(16).toString('base64'),
  ]) {
    await expect(signWebhook(id, body, key, now)).rejects.toThrow(
      'INVALID_WEBHOOK_SIGNING',
    );
    expect(
      await verifyWebhook(
        body,
        { id, timestamp: String(now / 1000), signature: 'v1,bad' },
        key,
        now,
      ),
    ).toBe(false);
  }
  await expect(signWebhook('invalid', body, secret, now)).rejects.toThrow(
    'INVALID_WEBHOOK_SIGNING',
  );
  await expect(
    signWebhook(id, '🔐'.repeat(65537), secret, now),
  ).rejects.toThrow('INVALID_WEBHOOK_SIGNING');
  for (const time of [NaN, 0, 1, Infinity, 1e20])
    await expect(signWebhook(id, body, secret, time)).rejects.toThrow(
      'INVALID_WEBHOOK_SIGNING',
    );
});
it('encrypts destination capabilities with fresh IVs and tenant/form/version binding', async () => {
  const sealed = await sealWebhookDestination(destination, master, context);
  expect(sealed).not.toContain('synthetic');
  expect(sealed).not.toContain(secret);
  expect(await sealWebhookDestination(destination, master, context)).not.toBe(
    sealed,
  );
  expect(await openWebhookDestination(sealed, master, context)).toEqual(
    destination,
  );
  expect(
    await openWebhookDestination(sealed, master, {
      ...context,
      workspaceId: context.workspaceId.toUpperCase(),
    }),
  ).toEqual(destination);
  const [, iv, raw] = sealed.split('.'),
    bytes = Buffer.from(raw, 'base64');
  const decoder = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(master, 'base64'),
    Buffer.from(iv, 'base64'),
  );
  decoder.setAAD(
    Buffer.from(
      `snapform-webhook-v1|${context.workspaceId}|${context.formId}|${context.configurationId}`,
    ),
  );
  decoder.setAuthTag(bytes.subarray(-16));
  expect(
    JSON.parse(
      Buffer.concat([
        decoder.update(bytes.subarray(0, -16)),
        decoder.final(),
      ]).toString('utf8'),
    ),
  ).toEqual(destination);
  await expect(
    openWebhookDestination(
      sealed,
      Buffer.alloc(32, 8).toString('base64'),
      context,
    ),
  ).rejects.toThrow('WEBHOOK_DESTINATION_UNAVAILABLE');
  await expect(
    openWebhookDestination(sealed, master, {
      ...context,
      workspaceId: context.formId,
    }),
  ).rejects.toThrow('WEBHOOK_DESTINATION_UNAVAILABLE');
  await expect(
    openWebhookDestination(sealed, master, {
      ...context,
      formId: context.configurationId,
    }),
  ).rejects.toThrow('WEBHOOK_DESTINATION_UNAVAILABLE');
  await expect(
    openWebhookDestination(sealed, master, {
      ...context,
      configurationId: context.workspaceId,
    }),
  ).rejects.toThrow('WEBHOOK_DESTINATION_UNAVAILABLE');
  bytes[0] ^= 1;
  await expect(
    openWebhookDestination(
      `v1.${iv}.${bytes.toString('base64')}`,
      master,
      context,
    ),
  ).rejects.toThrow('WEBHOOK_DESTINATION_UNAVAILABLE');
});
it('fails closed on malformed encrypted envelopes, keys and contexts', async () => {
  for (const sealed of ['', 'v2.a.b', 'v1.?.?', 'v1.' + 'x'.repeat(8192)])
    await expect(
      openWebhookDestination(sealed, master, context),
    ).rejects.toThrow('WEBHOOK_DESTINATION_UNAVAILABLE');
  await expect(
    sealWebhookDestination(destination, 'bad', context),
  ).rejects.toThrow();
  await expect(
    sealWebhookDestination(destination, master, {
      ...context,
      configurationId: 'invalid',
    }),
  ).rejects.toThrow();
  await expect(
    sealWebhookDestination(
      { ...destination, url: 'http://localhost' },
      master,
      context,
    ),
  ).rejects.toThrow();
});
it('validates decrypted configuration even when encryption itself authenticates', async () => {
  for (const value of [null, { ...destination, secret: 'invalid' }]) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(master, 'base64'),
      iv,
    );
    cipher.setAAD(
      Buffer.from(
        `snapform-webhook-v1|${context.workspaceId}|${context.formId}|${context.configurationId}`,
      ),
    );
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    const sealed = `v1.${Buffer.from(iv).toString('base64')}.${bytes.toString('base64')}`;
    await expect(
      openWebhookDestination(sealed, master, context),
    ).rejects.toThrow('WEBHOOK_DESTINATION_UNAVAILABLE');
  }
});
