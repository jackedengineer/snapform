import { sql } from 'drizzle-orm';
import {
  checkoutInputSchema,
  subscriptionIdSchema,
} from '@snapform/contracts/billing';
import type { CheckoutInput } from '@snapform/contracts/billing';
import {
  billingEventSchema,
  billingRecordSchema,
} from '@snapform/contracts/billing-server';
import type { BillingEvent } from '@snapform/contracts/billing-server';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
type Connection = Database | Transaction;
const instant = (column: string) =>
  sql.raw(
    `to_char(${column} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
  );
// Database functions raise typed messages; expose only those, never SQL detail.
function typed(error: unknown, codes: string[]): unknown {
  const code =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : '';
  return codes.includes(code) ? Error(code, { cause: error }) : error;
}
export async function getBilling(
  db: Connection,
  actor: string,
  workspaceId: string,
) {
  return inWorkspace(db, actor, workspaceId, 'responses.read', async (tx) => {
    const [row] = (
      await tx.execute<Record<string, unknown>>(sql`select
        current_setting('snapform.role') as role,plan,status,billing_interval as "interval",currency,
        ${instant('current_period_end')} as "currentPeriodEnd",cancel_at_period_end as "cancelAtPeriodEnd",
        checkout_subscription as "checkoutSubscription",responses_used as "responsesUsed",
        responses_reserved as "responsesReserved",response_limit as "responseLimit",live_forms as "liveForms",
        live_form_limit as "liveFormLimit",seats_used as "seatsUsed",seat_limit as "seatLimit",
        ${instant('resets_at')} as "resetsAt"
      from public.workspace_billing(${workspaceId}::uuid)`)
    ).rows;
    if (!row) throw Error('WORKSPACE_NOT_FOUND');
    return billingRecordSchema.parse(row);
  });
}
export async function recordSubscription(
  db: Connection,
  actor: string,
  workspaceId: string,
  subscriptionId: string,
  raw: CheckoutInput,
) {
  const input = checkoutInputSchema.parse(raw);
  subscriptionId = subscriptionIdSchema.parse(subscriptionId);
  return inWorkspace(db, actor, workspaceId, 'billing.manage', async (tx) => {
    try {
      await tx.execute(
        sql`select public.record_billing_subscription(${workspaceId}::uuid,${subscriptionId},${input.interval},${input.currency})`,
      );
    } catch (error) {
      throw typed(error, ['BILLING_ALREADY_ACTIVE', 'FORBIDDEN']);
    }
  });
}
export async function markCancellation(
  db: Connection,
  actor: string,
  workspaceId: string,
  subscriptionId: string,
) {
  subscriptionId = subscriptionIdSchema.parse(subscriptionId);
  return inWorkspace(db, actor, workspaceId, 'billing.manage', async (tx) => {
    try {
      const [row] = (
        await tx.execute<{ marked: boolean }>(
          sql`select public.mark_billing_cancellation(${workspaceId}::uuid,${subscriptionId}) as marked`,
        )
      ).rows;
      return row?.marked === true;
    } catch (error) {
      throw typed(error, ['FORBIDDEN']);
    }
  });
}
/** Only for a provider event whose signature the caller already verified. */
export async function applyBillingEvent(db: Connection, raw: BillingEvent) {
  const event = billingEventSchema.parse(raw);
  const [row] = (
    await db.execute<{ outcome: unknown }>(
      sql`select public.apply_billing_event(${event.id},${event.type},${event.createdAt.toISOString()}::timestamptz,
        ${event.workspaceId}::uuid,${event.subscriptionId},${event.customerId},${event.interval},${event.currency},
        ${event.periodStart?.toISOString() ?? null}::timestamptz,${event.periodEnd?.toISOString() ?? null}::timestamptz) as outcome`,
    )
  ).rows;
  const outcome = row?.outcome;
  if (outcome !== 'applied' && outcome !== 'ignored' && outcome !== 'duplicate')
    throw Error('BILLING_EVENT_UNCONFIRMED');
  return outcome;
}
