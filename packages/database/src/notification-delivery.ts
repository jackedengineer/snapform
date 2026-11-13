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
// Owner-visible fields only: never the answers themselves.
export type OwnerEmailSummary = {
  formTitle: string;
  submittedAt: string;
  respondentName: string | null;
  respondentEmail: string | null;
};
const optionalText = (value: unknown) =>
  value === null || typeof value === 'string';
export async function prepareOwnerEmail(
  db: Database | Transaction,
  claim: OwnerEmailClaim,
): Promise<OwnerEmailSummary | null> {
  const { rows } = await db.execute<{ allowed: boolean }>(
    sql`select public.prepare_owner_email(${claim.id}::uuid,${claim.leaseToken}::uuid) as allowed`,
  );
  if (typeof rows[0]?.allowed !== 'boolean')
    throw Error('Invalid email authorization receipt');
  if (!rows[0].allowed) return null;
  // Read after authorization so cancelled sends never load respondent data.
  const summary = await db.execute<{
    form_title: string | null;
    submitted_at: Date | string | null;
    respondent_name: string | null;
    respondent_email: string | null;
  }>(
    sql`select * from public.owner_email_summary(${claim.id}::uuid,${claim.leaseToken}::uuid)`,
  );
  if (summary.rows.length === 0) return null;
  const row = summary.rows[0];
  if (
    summary.rows.length !== 1 ||
    !optionalText(row.form_title) ||
    !optionalText(row.respondent_name) ||
    !optionalText(row.respondent_email) ||
    row.submitted_at === null ||
    !Number.isFinite(new Date(row.submitted_at).getTime())
  )
    throw Error('Invalid email summary receipt');
  return {
    formTitle: row.form_title ?? '',
    submittedAt: new Date(row.submitted_at).toISOString(),
    respondentName: row.respondent_name,
    respondentEmail: row.respondent_email,
  };
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
