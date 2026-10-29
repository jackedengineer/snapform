import { openWebhookDestination } from '@snapform/contracts/webhook-crypto';
import { createWebhookPayload } from '@snapform/contracts/webhook-payload';
import type { WebhookOutcome } from '@snapform/contracts/webhook-protocol';
import type { WebhookClaim } from '@snapform/database/webhook-attempts';
import type { WebhookSend } from './webhook-send';

export async function dispatchWebhooks(commands: {
  master: string;
  claim: () => Promise<WebhookClaim[]>;
  prepare: (claim: WebhookClaim, body: string | null) => Promise<boolean>;
  send: (delivery: WebhookSend) => Promise<WebhookOutcome>;
  record: (claim: WebhookClaim, outcome: WebhookOutcome) => Promise<boolean>;
}) {
  const claims = await commands.claim();
  const result = {
    claimed: claims.length,
    acknowledged: 0,
    retry: 0,
    unknown: 0,
    needs_action: 0,
    stale: 0,
    failed: 0,
  };
  for (const claim of claims) {
    try {
      let destination,
        body: string | undefined,
        outcome: WebhookOutcome | undefined;
      try {
        destination = await openWebhookDestination(
          claim.sealedDestination,
          commands.master,
          claim,
        );
      } catch {
        outcome = {
          status: 'needs_action',
          reason: 'configuration',
          httpStatus: null,
        };
      }
      if (destination) {
        try {
          if (claim.payload !== null) body = claim.payload;
          else {
            if (!claim.snapshot || claim.kind !== 'response.submitted')
              throw Error();
            body = createWebhookPayload(
              {
                id: claim.id,
                formId: claim.formId,
                createdAt: claim.createdAt,
              },
              claim.snapshot,
              false,
            );
          }
        } catch {
          outcome = {
            status: 'needs_action',
            reason: 'payload-invalid',
            httpStatus: null,
          };
        }
        if (body !== undefined) {
          if (
            !(await commands.prepare(
              claim,
              claim.payload === null ? body : null,
            ))
          ) {
            outcome = {
              status: 'needs_action',
              reason: 'payload-invalid',
              httpStatus: null,
            };
          } else {
            try {
              outcome = await commands.send({
                ...destination,
                id: claim.id,
                body,
                attempts: claim.attempts,
              });
            } catch {
              outcome = {
                status: 'unknown',
                reason: 'receiver-unconfirmed',
                httpStatus: null,
              };
            }
          }
        }
      }
      if (!outcome) throw Error('Missing webhook outcome');
      if (await commands.record(claim, outcome)) result[outcome.status]++;
      else result.stale++;
    } catch {
      // Leave the lease to expire as Unknown; a failed write never triggers another send.
      result.failed++;
    }
  }
  return result;
}
