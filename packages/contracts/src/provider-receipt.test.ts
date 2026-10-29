import { expect, it } from 'vitest';
import { readProviderReceipt } from './provider-receipt.ts';
const deliveryId = crypto.randomUUID(),
  providerId = crypto.randomUUID();
const data = {
  email_id: providerId,
  to: ['qa@example.invalid'],
  tags: { snapform_delivery: deliveryId },
  subject: 'private synthetic subject',
};
it('projects supported signed email states without returning provider payloads', () => {
  for (const [type, status] of Object.entries({
    'email.sent': 'accepted',
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
    'email.suppressed': 'suppressed',
  })) {
    expect(readProviderReceipt({ type, data, other: 'unused' })).toEqual({
      deliveryId,
      providerId,
      recipient: 'qa@example.invalid',
      status,
    });
  }
});
it('ignores untagged or unrelated events and rejects malformed tagged metadata', () => {
  for (const value of [
    null,
    [],
    true,
    'text',
    {},
    { type: 7 },
    { type: 'new.event' },
    { type: 'email.sent' },
    { type: 'email.sent', data: null },
    { type: 'email.sent', data: { tags: null } },
    { type: 'email.sent', data: { tags: {} } },
  ])
    expect(readProviderReceipt(value)).toBeNull();
  for (const value of [
    { ...data, email_id: 'invalid' },
    { ...data, to: ['qa@example.invalid', 'other@example.invalid'] },
    { ...data, to: [] },
    { ...data, tags: { snapform_delivery: 'invalid' } },
  ])
    expect(() =>
      readProviderReceipt({ type: 'email.sent', data: value }),
    ).toThrow('INVALID_PROVIDER_EVENT');
});
