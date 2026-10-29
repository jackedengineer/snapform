import { sql } from 'drizzle-orm';
import type { WebhookOutcome } from '@snapform/contracts/webhook-protocol';
import type { WebhookContext } from '@snapform/contracts/webhook-crypto';
import type { ResponseDetail } from '@snapform/contracts/responses';
import { responseEventMessageSchema } from '@snapform/contracts/response-event';
import type { Database, Transaction } from './client.ts';

export type WebhookClaim = WebhookContext & {
  id: string;
  leaseToken: string;
  versionId: string;
  sessionId: string | null;
  kind: 'test' | 'response.submitted';
  payload: string | null;
  sealedDestination: string;
  attempts: number;
  createdAt: string;
  snapshot: ResponseDetail | null;
};
export async function claimWebhooks(
  db: Database | Transaction,
  requestedId?: string,
): Promise<WebhookClaim[]> {
  const id =
    requestedId === undefined
      ? null
      : responseEventMessageSchema.shape.eventId.parse(requestedId);
  const { rows } = await db.execute<{
    id: string;
    lease_token: string;
    workspace_id: string;
    form_id: string;
    configuration_id: string;
    version_id: string;
    session_id: string | null;
    kind: WebhookClaim['kind'];
    payload: string | null;
    sealed_destination: string;
    attempts: number;
    created_at: Date | string;
    definition: ResponseDetail['definition'] | null;
    answers: ResponseDetail['answers'] | null;
    version_number: number;
    submitted_at: Date | string | null;
  }>(sql`select * from public.claim_webhooks(${id ? 1 : 5},${id}::uuid)`);
  return rows.map((row) => ({
    id: row.id,
    leaseToken: row.lease_token,
    workspaceId: row.workspace_id,
    formId: row.form_id,
    configurationId: row.configuration_id,
    versionId: row.version_id,
    sessionId: row.session_id,
    kind: row.kind,
    payload: row.payload,
    sealedDestination: row.sealed_destination,
    attempts: row.attempts,
    createdAt: new Date(row.created_at).toISOString(),
    snapshot:
      row.session_id && row.definition && row.answers && row.submitted_at
        ? {
            id: row.session_id,
            versionId: row.version_id,
            version: row.version_number,
            definition: row.definition,
            answers: row.answers,
            submittedAt: new Date(row.submitted_at).toISOString(),
          }
        : null,
  }));
}
export async function prepareWebhookPayload(
  db: Database | Transaction,
  claim: WebhookClaim,
  body: string | null,
) {
  const { rows } = await db.execute<{ prepared: boolean }>(
    sql`select public.prepare_webhook_payload(${claim.id}::uuid,${claim.leaseToken}::uuid,${body}) as prepared`,
  );
  if (typeof rows[0]?.prepared !== 'boolean')
    throw Error('Invalid webhook preparation receipt');
  return rows[0].prepared;
}
export async function recordWebhookAttempt(
  db: Database | Transaction,
  claim: WebhookClaim,
  outcome: WebhookOutcome,
) {
  const { rows } = await db.execute<{ recorded: boolean }>(
    sql`select public.record_webhook_attempt(${claim.id}::uuid,${claim.leaseToken}::uuid,${outcome.status},${outcome.httpStatus}::integer,${'reason' in outcome ? outcome.reason : null},${outcome.status === 'retry' ? outcome.delaySeconds : 0}::integer) as recorded`,
  );
  if (typeof rows[0]?.recorded !== 'boolean')
    throw Error('Invalid webhook attempt receipt');
  return rows[0].recorded;
}
