import { expect, it } from 'vitest';
import {
  createWebhookSecret,
  sealWebhookDestination,
  openWebhookDestination,
  signWebhook,
  verifyWebhook,
} from '@snapform/contracts/webhook-crypto';
import { parseWebhookTarget } from '@snapform/contracts/webhook-target';
it('uses native workerd crypto and URL policy without a provider or database', async () => {
  const context = {
    workspaceId: crypto.randomUUID(),
    formId: crypto.randomUUID(),
    configurationId: crypto.randomUUID(),
  };
  const master = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  const value = {
    url: 'https://hooks.example.com/owned-fixture',
    secret: createWebhookSecret(),
  };
  const sealed = await sealWebhookDestination(value, master, context);
  expect(await openWebhookDestination(sealed, master, context)).toEqual(value);
  await expect(
    openWebhookDestination(sealed, master, {
      ...context,
      formId: crypto.randomUUID(),
    }),
  ).rejects.toThrow('WEBHOOK_DESTINATION_UNAVAILABLE');
  const raw = '{"type":"snapform.test","zero":0}\n',
    signed = await signWebhook(crypto.randomUUID(), raw, value.secret);
  expect(await verifyWebhook(raw, signed, value.secret)).toBe(true);
  expect(await verifyWebhook(raw + ' ', signed, value.secret)).toBe(false);
  const large = JSON.stringify({ answer: 'a'.repeat(2096652) });
  const largeSignature = await signWebhook(
    crypto.randomUUID(),
    large,
    value.secret,
  );
  expect(await verifyWebhook(large, largeSignature, value.secret)).toBe(true);
  expect(() => parseWebhookTarget('https://2130706433/')).toThrow(
    'INVALID_WEBHOOK_TARGET',
  );
});
