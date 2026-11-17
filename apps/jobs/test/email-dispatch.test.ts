import { expect, it, vi } from 'vitest';
import { dispatchOwnerEmails } from '../src/email-dispatch';
import type { Database } from '@snapform/database';
import { prepareOwnerEmail } from '@snapform/database/notification-delivery';
import type {
  OwnerEmailClaim,
  OwnerEmailSummary,
} from '@snapform/database/notification-delivery';
const summary: OwnerEmailSummary = {
  formTitle: 'Website enquiry',
  submittedAt: new Date().toISOString(),
  respondentName: 'Ada Lovelace',
  respondentEmail: 'ada@example.invalid',
};
const prepare = async () => summary;
const claim: OwnerEmailClaim = {
  id: crypto.randomUUID(),
  leaseToken: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  formId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  recipient: 'qa@example.invalid',
  firstAttemptAt: new Date().toISOString(),
};
it('sends the prepared summary and records provider results before counting a durable accepted attempt', async () => {
  const outcome = {
    status: 'accepted' as const,
    providerId: crypto.randomUUID(),
  };
  const send = vi.fn(async (email) => {
      expect(email).toEqual({ ...claim, summary });
      return outcome;
    }),
    record = vi.fn(async (value, result) => {
      expect(value).toBe(claim);
      expect(result).toBe(outcome);
      return true;
    });
  expect(
    await dispatchOwnerEmails({
      claim: async () => [claim],
      prepare,
      send,
      record,
    }),
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
      prepare,
      send,
      record: async () => false,
    }),
  ).toEqual({ claimed: 1, accepted: 0, retry: 0, attention: 0, superseded: 1 });
  await expect(
    dispatchOwnerEmails({
      claim: async () => [claim],
      prepare,
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
      prepare,
      send,
      record: async () => true,
    }),
  ).toEqual({ claimed: 0, accepted: 0, retry: 0, attention: 0, superseded: 0 });
  expect(send).not.toHaveBeenCalled();
  expect(
    (
      await dispatchOwnerEmails({
        claim: async () => [claim],
        prepare,
        send,
        record: async () => true,
      })
    ).retry,
  ).toBe(1);
  expect(
    (
      await dispatchOwnerEmails({
        claim: async () => [claim],
        prepare,
        send: async () => ({ status: 'needs_action', reason: 'configuration' }),
        record: async () => true,
      })
    ).attention,
  ).toBe(1);
});
it('does no provider work when the pre-send authorization is revoked or unavailable', async () => {
  const send = vi.fn(),
    record = vi.fn();
  expect(
    await dispatchOwnerEmails({
      claim: async () => [claim],
      prepare: async () => null,
      send,
      record,
    }),
  ).toEqual({ claimed: 1, accepted: 0, retry: 0, attention: 0, superseded: 1 });
  await expect(
    dispatchOwnerEmails({
      claim: async () => [claim],
      prepare: async () => {
        throw Error('Authorization unavailable');
      },
      send,
      record,
    }),
  ).rejects.toThrow('Authorization unavailable');
  expect(send).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
});
function database(...receipts: unknown[][]) {
  const execute = vi.fn(async () => ({
    rows: receipts[execute.mock.calls.length - 1] ?? [],
  }));
  return { db: { execute } as unknown as Database, execute };
}
it('reads the bounded summary only after the send is authorized', async () => {
  const denied = database([{ allowed: false }]);
  expect(await prepareOwnerEmail(denied.db, claim)).toBeNull();
  expect(denied.execute).toHaveBeenCalledOnce();
  const allowed = database(
    [{ allowed: true }],
    [
      {
        form_title: 'Website enquiry',
        submitted_at: new Date('2026-10-29T11:58:00Z'),
        respondent_name: 'Ada Lovelace',
        respondent_email: null,
      },
    ],
  );
  expect(await prepareOwnerEmail(allowed.db, claim)).toEqual({
    formTitle: 'Website enquiry',
    submittedAt: '2026-10-29T11:58:00.000Z',
    respondentName: 'Ada Lovelace',
    respondentEmail: null,
  });
  expect(allowed.execute).toHaveBeenCalledTimes(2);
  expect(
    await prepareOwnerEmail(database([{ allowed: true }], []).db, claim),
  ).toBeNull();
});
it('rejects malformed authorization and summary receipts', async () => {
  const row = {
    form_title: 'Website enquiry',
    submitted_at: '2026-10-29T11:58:00Z',
    respondent_name: null,
    respondent_email: null,
  };
  await expect(
    prepareOwnerEmail(database([{ allowed: 'yes' }]).db, claim),
  ).rejects.toThrow('Invalid email authorization receipt');
  for (const receipt of [
    [row, row],
    [{ ...row, submitted_at: 'never' }],
    [{ ...row, submitted_at: null }],
    [{ ...row, form_title: 7 }],
    [{ ...row, respondent_email: ['a@example.invalid'] }],
  ])
    await expect(
      prepareOwnerEmail(database([{ allowed: true }], receipt).db, claim),
    ).rejects.toThrow('Invalid email summary receipt');
});
