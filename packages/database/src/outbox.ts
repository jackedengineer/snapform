import { sql } from 'drizzle-orm';
import type { Database, Transaction } from './client.ts';
type Connection = Database | Transaction;
export type ResponseEventLease = { eventId: string; leaseToken: string };

export async function claimResponseEvents(
  db: Connection,
): Promise<ResponseEventLease[]> {
  const result = await db.execute<{ event_id: string; lease_token: string }>(
    sql`select * from public.claim_response_events(20,null)`,
  );
  return result.rows.map((row) => ({
    eventId: row.event_id,
    leaseToken: row.lease_token,
  }));
}
export async function recordResponseDispatch(
  db: Connection,
  lease: ResponseEventLease,
  queued: boolean,
) {
  const result = await db.execute<{ recorded: boolean }>(
    sql`select public.record_response_dispatch(${lease.eventId}::uuid,${lease.leaseToken}::uuid,${queued}) as recorded`,
  );
  if (typeof result.rows[0]?.recorded !== 'boolean')
    throw new Error('Invalid dispatch receipt');
  return result.rows[0].recorded;
}
export async function acknowledgeResponseEvent(
  db: Connection,
  eventId: string,
): Promise<void> {
  const result = await db.execute<{ outcome: string }>(
    sql`select public.acknowledge_response_event(${eventId}::uuid) as outcome`,
  );
  if (
    !['completed', 'already_completed', 'missing'].includes(
      result.rows[0]?.outcome,
    )
  )
    throw new Error('Invalid event acknowledgment');
}
