import {
  SELF,
  createMessageBatch,
  createExecutionContext,
  getQueueResult,
} from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import worker from '../src/worker';
import type { ResponseEventMessage } from '@snapform/contracts/response-event';
import { relayResponseEvents, consumeResponseEvents } from '../src/transport';

it('confirms database dispatch only after Queue publication has succeeded', async () => {
  const lease = {
    eventId: crypto.randomUUID(),
    leaseToken: crypto.randomUUID(),
  };
  let queued = false;
  const sendBatch = vi.fn<Queue<ResponseEventMessage>['sendBatch']>(
    async (messages) => {
      expect(messages).toEqual([
        { body: { version: 1, eventId: lease.eventId }, contentType: 'json' },
      ]);
      queued = true;
      return { metadata: { metrics: { backlogCount: 1, backlogBytes: 64 } } };
    },
  );
  const record = vi.fn(async () => {
    expect(queued).toBe(true);
    return true;
  });
  expect(
    await relayResponseEvents(
      { sendBatch },
      { claim: async () => [lease], record },
    ),
  ).toEqual({ claimed: 1, confirmed: 1 });
});
it('releases failed publication attempts for database-controlled backoff', async () => {
  const lease = {
    eventId: crypto.randomUUID(),
    leaseToken: crypto.randomUUID(),
  };
  let recorded: boolean | null = null;
  await expect(
    relayResponseEvents(
      {
        sendBatch: async () => {
          throw Error('Synthetic Queue outage');
        },
      },
      {
        claim: async () => [lease],
        record: async (_lease, queued) => {
          recorded = queued;
          return true;
        },
      },
    ),
  ).rejects.toThrow('QUEUE_DISPATCH_UNAVAILABLE');
  expect(recorded).toBe(false);
});
it('acknowledges duplicate events and rejects unknown payload fields without forwarding them', async () => {
  const eventId = crypto.randomUUID();
  const batch = createMessageBatch('snapform-response-events', [
    {
      id: 'first',
      timestamp: new Date(),
      attempts: 1,
      body: { version: 1, eventId },
    },
    {
      id: 'duplicate',
      timestamp: new Date(),
      attempts: 1,
      body: { version: 1, eventId },
    },
    {
      id: 'invalid',
      timestamp: new Date(),
      attempts: 1,
      body: {
        version: 1,
        eventId,
        answers: { private: 'must not be forwarded' },
      },
    },
  ]);
  const acknowledge = vi.fn(async () => {});
  expect(await consumeResponseEvents(batch, acknowledge)).toEqual({
    acknowledged: 2,
    retried: 0,
    rejected: 1,
  });
  expect(acknowledge.mock.calls).toEqual([[eventId], [eventId]]);
  const result = await getQueueResult(batch, createExecutionContext());
  expect(result.explicitAcks).toEqual(['first', 'duplicate', 'invalid']);
  expect(result.retryMessages).toEqual([]);
});
it('retries only failed events while retaining successful acknowledgments', async () => {
  const failedId = crypto.randomUUID(),
    goodId = crypto.randomUUID();
  const batch = createMessageBatch('snapform-response-events', [
    {
      id: 'failed',
      timestamp: new Date(),
      attempts: 1,
      body: { version: 1, eventId: failedId },
    },
    {
      id: 'good',
      timestamp: new Date(),
      attempts: 1,
      body: { version: 1, eventId: goodId },
    },
  ]);
  expect(
    await consumeResponseEvents(batch, async (id) => {
      if (id === failedId) throw Error('Synthetic database outage');
    }),
  ).toEqual({ acknowledged: 1, retried: 1, rejected: 0 });
  const result = await getQueueResult(batch, createExecutionContext());
  expect(result.explicitAcks).toEqual(['good']);
  expect(result.retryMessages).toEqual([{ msgId: 'failed' }]);
});
it('does not expose job operations over HTTP', async () => {
  const response = await SELF.fetch('https://snapform-jobs.invalid/');
  expect(response.status).toBe(404);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

it('retries the real Worker batch when its restricted database identity is unavailable', async () => {
  const batch = createMessageBatch('snapform-response-events', [
    {
      id: 'unavailable',
      timestamp: new Date(),
      attempts: 1,
      body: { version: 1, eventId: crypto.randomUUID() },
    },
  ]);
  const sendBatch = vi.fn<Queue<ResponseEventMessage>['sendBatch']>();
  await worker.queue(batch, { DATABASE_URL: '', EVENTS: { sendBatch } });
  const result = await getQueueResult(batch, createExecutionContext());
  expect(result.retryBatch.retry).toBe(true);
  expect(result.explicitAcks).toEqual([]);
  expect(sendBatch).not.toHaveBeenCalled();
});
it('discards malformed messages at the Worker boundary without needing a database', async () => {
  const batch = createMessageBatch('snapform-response-events', [
    {
      id: 'malformed',
      timestamp: new Date(),
      attempts: 1,
      body: {
        version: 1,
        eventId: crypto.randomUUID(),
        answers: 'private synthetic value',
      },
    },
  ]);
  const logged = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const sendBatch = vi.fn<Queue<ResponseEventMessage>['sendBatch']>();
    await worker.queue(batch, { DATABASE_URL: '', EVENTS: { sendBatch } });
    const result = await getQueueResult(batch, createExecutionContext());
    expect(result.explicitAcks).toEqual(['malformed']);
    expect(result.retryBatch.retry).toBe(false);
    expect(logged.mock.calls).toEqual([
      [
        JSON.stringify({
          event: 'response_events_rejected',
          acknowledged: 0,
          retried: 0,
          rejected: 1,
        }),
      ],
    ]);
  } finally {
    logged.mockRestore();
  }
});
