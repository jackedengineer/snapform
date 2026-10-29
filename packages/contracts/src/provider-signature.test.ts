import { expect, it } from 'vitest';
import { verifyProviderSignature } from './provider-signature.ts';
// Published Svix fixture: https://docs.svix.com/receiving/verifying-payloads/how-manual
const secret = 'whsec_plJ3nmyCDGBKInavdOK15jsl';
const payload = '{"event_type":"ping","data":{"success":true}}';
const headers = {
  id: 'msg_loFOjxBNrRLzqYUf',
  timestamp: '1731705121',
  signature: 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
};
const now = 1731705121000;
it('verifies the published vector over the exact raw body and permits rotating signature lists', async () => {
  expect(await verifyProviderSignature(payload, headers, secret, now)).toBe(
    true,
  );
  expect(
    await verifyProviderSignature(
      payload,
      {
        ...headers,
        signature:
          'v2,unsupported v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ' +
          headers.signature,
      },
      secret,
      now,
    ),
  ).toBe(true);
  expect(
    await verifyProviderSignature(payload, headers, secret, now + 300000),
  ).toBe(true);
  expect(
    await verifyProviderSignature(payload, headers, secret, now - 300000),
  ).toBe(true);
});
it('rejects tampering, stale/future timestamps, missing headers and malformed signing material', async () => {
  for (const h of [
    { ...headers, id: '' },
    { ...headers, timestamp: '' },
    { ...headers, signature: '' },
    { ...headers, id: 'different-message' },
    { ...headers, id: 'x'.repeat(129) },
    { ...headers, timestamp: 'not-a-time' },
    { ...headers, timestamp: '1731705122' },
    { ...headers, signature: 'v2,unsupported' },
    { ...headers, signature: 'v1,%%%invalid' },
    { ...headers, signature: 'v1,YQ==' },
    { ...headers, signature: 'x'.repeat(1025) },
  ])
    expect(await verifyProviderSignature(payload, h, secret, now)).toBe(false);
  for (const value of ['', 'wrong-prefix', 'whsec_%%%', 'whsec_YQ=='])
    expect(await verifyProviderSignature(payload, headers, value, now)).toBe(
      false,
    );
  expect(
    await verifyProviderSignature(payload + ' ', headers, secret, now),
  ).toBe(false);
  expect(
    await verifyProviderSignature(payload, headers, secret, now + 301000),
  ).toBe(false);
  expect(
    await verifyProviderSignature(payload, headers, secret, now - 301000),
  ).toBe(false);
});
it('bounds raw UTF-8 bytes and signature work before verification', async () => {
  expect(
    await verifyProviderSignature('é'.repeat(20000), headers, secret, now),
  ).toBe(false);
  expect(
    await verifyProviderSignature(
      payload,
      { ...headers, signature: Array(9).fill(headers.signature).join(' ') },
      secret,
      now,
    ),
  ).toBe(false);
});
