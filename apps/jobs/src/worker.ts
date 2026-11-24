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
  prepareOwnerEmail,
  recordOwnerEmail,
  recordOwnerProviderStatus,
} from '@snapform/database/notification-delivery';
import { dispatchOwnerEmails } from './email-dispatch';
import { sendOwnerEmail } from './owner-email';
import { handleProviderReceipt } from './provider-receipt';
import {
  claimWebhooks,
  prepareWebhookPayload,
  recordWebhookAttempt,
} from '@snapform/database/webhook-attempts';
import { dispatchWebhooks } from './webhook-dispatch';
import { sendWebhook } from './webhook-send';
import { handleWebhookWake } from './webhook-wake';
import { handleResponseWake } from './response-wake';
import { runScheduledPurge } from './purge-ledger';
import {
  claimOwnerDeletions,
  claimExpiredResponses,
  finalizeResponsePurge,
  pruneDeletionMetadata,
  finalizeWorkspacePurge,
  purgeFilePrefix,
} from '@snapform/database/purge';
import type { Database } from '@snapform/database';
import {
  handleOperationsStatus,
  operationsEnabled,
  reportOperations,
} from './operations';
import type { OperationsEnvironment } from './operations';

type JobEnvironment = OperationsEnvironment & {
  PURGE_ENABLED?: string;
  PURGE_LEDGER_KEY?: string;
  PURGE_LEDGER?: R2Bucket;
  UPLOADS?: R2Bucket;
  DATABASE_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  EMAIL_FROM?: string;
  EMAIL_ALLOWED_RECIPIENT?: string;
  WEBHOOK_ENCRYPTION_KEY?: string;
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
async function deliverWebhooks(
  db: Database,
  environment: JobEnvironment,
  id?: string,
) {
  const result = await dispatchWebhooks({
    master: environment.WEBHOOK_ENCRYPTION_KEY || '',
    claim: () => claimWebhooks(db, id),
    prepare: (claim, body) => prepareWebhookPayload(db, claim, body),
    send: (delivery) => sendWebhook(delivery),
    record: (claim, outcome) => recordWebhookAttempt(db, claim, outcome),
  });
  if (result.claimed)
    console.log(JSON.stringify({ event: 'webhook_attempts', ...result }));
  return result;
}
// Queue new response events, send owner emails and deliver webhooks. A submit
// wakes this at once; the sweep repeats it for retries and anything missed.
async function deliverResponses(db: Database, environment: JobEnvironment) {
  const result = await relayResponseEvents(environment.EVENTS, {
    claim: () => claimResponseEvents(db),
    record: (lease, queued) => recordResponseDispatch(db, lease, queued),
  });
  if (result.claimed)
    console.log(JSON.stringify({ event: 'response_events_queued', ...result }));
  const mail = await dispatchOwnerEmails({
    claim: () => claimOwnerEmails(db),
    prepare: (claim) => prepareOwnerEmail(db, claim),
    send: (claim) =>
      sendOwnerEmail(claim, {
        apiKey: environment.RESEND_API_KEY || '',
        from: environment.EMAIL_FROM || '',
        allowedRecipient: environment.EMAIL_ALLOWED_RECIPIENT,
      }),
    record: (claim, outcome) => recordOwnerEmail(db, claim, outcome),
  });
  if (mail.claimed)
    console.log(JSON.stringify({ event: 'owner_email_attempts', ...mail }));
  const webhooks = await deliverWebhooks(db, environment);
  return {
    events: result.claimed,
    emails: mail.claimed,
    webhooks: webhooks.claimed,
    failed: webhooks.failed,
  };
}
export default {
  async fetch(request, environment) {
    if (new URL(request.url).pathname === '/dispatch/responses')
      return handleResponseWake(request, async () => {
        const { db, close } = await connect(environment);
        try {
          return await deliverResponses(db, environment);
        } finally {
          await close();
        }
      });
    if (new URL(request.url).pathname === '/dispatch/webhooks')
      return handleWebhookWake(request, async (id) => {
        const { db, close } = await connect(environment);
        try {
          return await deliverWebhooks(db, environment, id);
        } finally {
          await close();
        }
      });
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
    if (new URL(request.url).pathname === '/api/v1/status')
      return handleOperationsStatus(request, environment);
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  },
  async scheduled(
    _controller: ScheduledController,
    environment: JobEnvironment,
  ) {
    let failed = false;
    try {
      const { db, close } = await connect(environment);
      try {
        const purge = await runScheduledPurge(
          {
            enabled: environment.PURGE_ENABLED,
            secret: environment.PURGE_LEDGER_KEY,
            bucket: environment.PURGE_LEDGER,
            uploads: environment.UPLOADS,
          },
          {
            owner: () => claimOwnerDeletions(db),
            expired: () => claimExpiredResponses(db),
            prefix: (intent) => purgeFilePrefix(db, intent),
            finalize: (intent) =>
              intent.kind === 'workspace'
                ? finalizeWorkspacePurge(db, intent)
                : finalizeResponsePurge(db, intent),
          },
        );
        if (purge.claimed)
          console.log(JSON.stringify({ event: 'retention_purge', ...purge }));
        if (environment.PURGE_ENABLED === '1' && !purge.failed) {
          const metadata = await pruneDeletionMetadata(db);
          if (metadata.requestsDeleted || metadata.intentsDeleted)
            console.log(
              JSON.stringify({
                event: 'deletion_metadata_pruned',
                ...metadata,
              }),
            );
        }
        const delivery = await deliverResponses(db, environment);
        if (delivery.failed || purge.failed)
          throw Error('Job persistence unavailable');
      } finally {
        await close();
      }
    } catch {
      failed = true;
      console.error(JSON.stringify({ event: 'response_jobs_failed' }));
    }
    if (operationsEnabled(environment)) {
      try {
        await reportOperations(environment, failed);
      } catch {
        // The status goes stale, which the outside check reports.
        console.error(JSON.stringify({ event: 'operations_report_failed' }));
      }
    }
    if (failed) throw new Error('Response jobs failed');
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
