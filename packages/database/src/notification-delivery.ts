import { sql } from 'drizzle-orm';
import type { EmailOutcome } from '@snapform/contracts/notifications';
import type { ProviderEmailReceipt } from '@snapform/contracts/provider-receipt';
import type { Database, Transaction } from './client.ts';
export type OwnerEmailClaim = {
  id: string;
  leaseToken: string;
  workspaceId: string;
  formId: string;
  sessionId: string;
  recipient: string;
  firstAttemptAt: string;
};
export async function claimOwnerEmails(
  db: Database | Transaction,
): Promise<OwnerEmailClaim[]> {
  const { rows } = await db.execute<{
    id: string;
    lease_token: string;
    workspace_id: string;
    form_id: string;
    session_id: string;
    recipient: string;
    first_attempt_at: Date | string;
  }>(sql`select * from public.claim_owner_emails(5,null)`);
  return rows.map((row) => ({
    id: row.id,
    leaseToken: row.lease_token,
    workspaceId: row.workspace_id,
    formId: row.form_id,
    sessionId: row.session_id,
    recipient: row.recipient,
    firstAttemptAt: new Date(row.first_attempt_at).toISOString(),
  }));
}
export async function recordOwnerEmail(
  db: Database | Transaction,
  claim: OwnerEmailClaim,
  outcome: EmailOutcome,
): Promise<boolean> {
  const { rows } = await db.execute<{ recorded: boolean }>(
    sql`select public.record_owner_email(${claim.id}::uuid,${claim.leaseToken}::uuid,${outcome.status},${outcome.status === 'accepted' ? outcome.providerId : null}::uuid,${'reason' in outcome ? outcome.reason : null},${outcome.status === 'retry' ? outcome.delaySeconds : 0}::integer) as recorded`,
  );
  if (typeof rows[0]?.recorded !== 'boolean')
    throw Error('Invalid email attempt receipt');
  return rows[0].recorded;
}
export async function recordOwnerProviderStatus(
  db: Database | Transaction,
  receipt: ProviderEmailReceipt,
): Promise<boolean> {
  const { rows } = await db.execute<{ recorded: boolean }>(
    sql`select public.record_owner_provider_status(${receipt.deliveryId}::uuid,${receipt.providerId}::uuid,${receipt.recipient},${receipt.status}) as recorded`,
  );
  if (typeof rows[0]?.recorded !== 'boolean')
    throw Error('Invalid provider receipt');
  return rows[0].recorded;
}
