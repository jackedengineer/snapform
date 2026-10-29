import { expect, it, vi } from 'vitest';
import { dispatchOwnerEmails } from '../src/email-dispatch';
import type { OwnerEmailClaim } from '@snapform/database/notification-delivery';
const claim: OwnerEmailClaim = {
  id: crypto.randomUUID(),
  leaseToken: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  formId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  recipient: 'qa@example.invalid',
  firstAttemptAt: new Date().toISOString(),
};
it('records provider results before counting a durable accepted attempt', async () => {
  const outcome = {
    status: 'accepted' as const,
    providerId: crypto.randomUUID(),
  };
  const send = vi.fn(async () => outcome),
    record = vi.fn(async (value, result) => {
      expect(value).toBe(claim);
      expect(result).toBe(outcome);
      return true;
    });
  expect(
    await dispatchOwnerEmails({ claim: async () => [claim], send, record }),
  ).toEqual({ claimed: 1, accepted: 1, retry: 0, attention: 0, superseded: 0 });
  expect(send).toHaveBeenCalledOnce();
  expect(record).toHaveBeenCalledOnce();
});
it('does not call a fenced-out result delivered and leaves persistence failures recoverable', async () => {
  const send = async () => ({
    status: 'accepted' as const,
    providerId: crypto.randomUUID(),
  });
  expect(
    await dispatchOwnerEmails({
      claim: async () => [claim],
      send,
      record: async () => false,
    }),
  ).toEqual({ claimed: 1, accepted: 0, retry: 0, attention: 0, superseded: 1 });
  await expect(
    dispatchOwnerEmails({
      claim: async () => [claim],
      send,
      record: async () => {
        throw Error('Synthetic database outage');
      },
    }),
  ).rejects.toThrow('Synthetic database outage');
});
it('reports retry and attention outcomes and does no provider work when there are no claims', async () => {
  const send = vi.fn(async () => ({
    status: 'retry' as const,
    reason: 'provider-unavailable' as const,
    delaySeconds: 60,
  }));
  expect(
    await dispatchOwnerEmails({
      claim: async () => [],
      send,
      record: async () => true,
    }),
  ).toEqual({ claimed: 0, accepted: 0, retry: 0, attention: 0, superseded: 0 });
  expect(send).not.toHaveBeenCalled();
  expect(
    (
      await dispatchOwnerEmails({
        claim: async () => [claim],
        send,
        record: async () => true,
      })
    ).retry,
  ).toBe(1);
  expect(
    (
      await dispatchOwnerEmails({
        claim: async () => [claim],
        send: async () => ({ status: 'needs_action', reason: 'configuration' }),
        record: async () => true,
      })
    ).attention,
  ).toBe(1);
});
