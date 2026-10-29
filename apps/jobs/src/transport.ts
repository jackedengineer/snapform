import { responseEventMessageSchema } from '@snapform/contracts/response-event';
import type { ResponseEventMessage } from '@snapform/contracts/response-event';
import type { ResponseEventLease } from '@snapform/database/outbox';

export async function relayResponseEvents(
  queue: Pick<Queue<ResponseEventMessage>, 'sendBatch'>,
  commands: {
    claim: () => Promise<ResponseEventLease[]>;
    record: (lease: ResponseEventLease, queued: boolean) => Promise<boolean>;
  },
) {
  const leases = await commands.claim();
  if (!leases.length) return { claimed: 0, confirmed: 0 };
  let queued = true;
  try {
    await queue.sendBatch(
      leases.map((lease) => ({
        body: { version: 1, eventId: lease.eventId },
        contentType: 'json',
      })),
    );
  } catch {
    queued = false;
  }
  let confirmed = 0;
  for (const lease of leases)
    if (await commands.record(lease, queued)) confirmed++;
  if (!queued) throw new Error('QUEUE_DISPATCH_UNAVAILABLE');
  return { claimed: leases.length, confirmed };
}
export async function consumeResponseEvents(
  batch: MessageBatch<unknown>,
  acknowledge: (eventId: string) => Promise<void>,
) {
  let acknowledged = 0,
    retried = 0,
    rejected = 0;
  for (const message of batch.messages) {
    const input = responseEventMessageSchema.safeParse(message.body);
    if (!input.success) {
      message.ack();
      rejected++;
      continue;
    }
    try {
      await acknowledge(input.data.eventId);
      message.ack();
      acknowledged++;
    } catch {
      message.retry({ delaySeconds: 60 });
      retried++;
    }
  }
  return { acknowledged, retried, rejected };
}
