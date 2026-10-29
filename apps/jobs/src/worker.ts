import { openDatabase } from '@snapform/database';
import {
  claimResponseEvents,
  recordResponseDispatch,
  acknowledgeResponseEvent,
} from '@snapform/database/outbox';
import { responseEventMessageSchema } from '@snapform/contracts/response-event';
import type { ResponseEventMessage } from '@snapform/contracts/response-event';
import { relayResponseEvents, consumeResponseEvents } from './transport';
import {
  claimOwnerEmails,
  recordOwnerEmail,
  recordOwnerProviderStatus,
} from '@snapform/database/notification-delivery';
import { dispatchOwnerEmails } from './email-dispatch';
import { sendOwnerEmail } from './owner-email';
import { handleProviderReceipt } from './provider-receipt';

type JobEnvironment = {
  DATABASE_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  EMAIL_FROM?: string;
  EMAIL_ALLOWED_RECIPIENT?: string;
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
  async fetch(request, environment) {
    if (new URL(request.url).pathname === '/api/v1/hooks/resend')
      return handleProviderReceipt(
        request,
        environment.RESEND_WEBHOOK_SECRET || '',
        async (receipt) => {
          const { db, close } = await connect(environment);
          try {
            return await recordOwnerProviderStatus(db, receipt);
          } finally {
            await close();
          }
        },
      );
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
        const mail = await dispatchOwnerEmails({
          claim: () => claimOwnerEmails(db),
          send: (claim) =>
            sendOwnerEmail(claim, {
              apiKey: environment.RESEND_API_KEY || '',
              from: environment.EMAIL_FROM || '',
              allowedRecipient: environment.EMAIL_ALLOWED_RECIPIENT,
            }),
          record: (claim, outcome) => recordOwnerEmail(db, claim, outcome),
        });
        if (mail.claimed)
          console.log(
            JSON.stringify({ event: 'owner_email_attempts', ...mail }),
          );
      } finally {
        await close();
      }
    } catch {
      console.error(JSON.stringify({ event: 'response_jobs_failed' }));
      throw new Error('Response jobs failed');
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
