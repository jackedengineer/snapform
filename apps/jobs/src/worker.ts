import { openDatabase } from '@snapform/database';
import {
  claimResponseEvents,
  recordResponseDispatch,
  acknowledgeResponseEvent,
} from '@snapform/database/outbox';
import { responseEventMessageSchema } from '@snapform/contracts/response-event';
import type { ResponseEventMessage } from '@snapform/contracts/response-event';
import { relayResponseEvents, consumeResponseEvents } from './transport';

type JobEnvironment = {
  DATABASE_URL?: string;
  EVENTS: Pick<Queue<ResponseEventMessage>, 'sendBatch'>;
};
function connect(environment: JobEnvironment) {
  const url = environment.DATABASE_URL || '';
  let valid: boolean;
  try {
    valid = new URL(url).username === 'snapform_jobs';
  } catch {
    valid = false;
  }
  if (!valid) throw new Error('Job database configuration is unavailable');
  return openDatabase(url);
}
export default {
  fetch() {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  },
  async scheduled(
    _controller: ScheduledController,
    environment: JobEnvironment,
  ) {
    try {
      const { db, close } = await connect(environment);
      try {
        const result = await relayResponseEvents(environment.EVENTS, {
          claim: () => claimResponseEvents(db),
          record: (lease, queued) => recordResponseDispatch(db, lease, queued),
        });
        if (result.claimed)
          console.log(
            JSON.stringify({ event: 'response_events_queued', ...result }),
          );
      } finally {
        await close();
      }
    } catch {
      console.error(JSON.stringify({ event: 'outbox_relay_failed' }));
      throw new Error('Outbox relay failed');
    }
  },
  async queue(batch: MessageBatch<unknown>, environment: JobEnvironment) {
    if (
      !batch.messages.some(
        (message) => responseEventMessageSchema.safeParse(message.body).success,
      )
    ) {
      const result = await consumeResponseEvents(batch, async () => {
        throw new Error('Invalid event');
      });
      console.warn(
        JSON.stringify({ event: 'response_events_rejected', ...result }),
      );
      return;
    }
    let connection: Awaited<ReturnType<typeof openDatabase>>;
    try {
      connection = await connect(environment);
    } catch {
      batch.retryAll({ delaySeconds: 60 });
      console.error(
        JSON.stringify({ event: 'response_event_database_unavailable' }),
      );
      return;
    }
    try {
      const result = await consumeResponseEvents(batch, (id) =>
        acknowledgeResponseEvent(connection.db, id),
      );
      console.log(
        JSON.stringify({
          event: 'response_event_transport_receipt',
          ...result,
        }),
      );
      if (result.retried)
        console.error(
          JSON.stringify({
            event: 'response_event_retry',
            count: result.retried,
          }),
        );
    } finally {
      await connection.close();
    }
  },
} satisfies ExportedHandler<JobEnvironment>;
