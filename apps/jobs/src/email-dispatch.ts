import type {
  OwnerEmailClaim,
  OwnerEmailSummary,
} from '@snapform/database/notification-delivery';
import type { EmailOutcome } from '@snapform/contracts/notifications';

export async function dispatchOwnerEmails(commands: {
  claim: () => Promise<OwnerEmailClaim[]>;
  // Authorizes the send, then reads only its bounded summary; null when fenced out.
  prepare: (claim: OwnerEmailClaim) => Promise<OwnerEmailSummary | null>;
  send: (
    email: OwnerEmailClaim & { summary: OwnerEmailSummary },
  ) => Promise<EmailOutcome>;
  record: (claim: OwnerEmailClaim, outcome: EmailOutcome) => Promise<boolean>;
}) {
  const claims = await commands.claim();
  const result = {
    claimed: claims.length,
    accepted: 0,
    retry: 0,
    attention: 0,
    superseded: 0,
  };
  for (const claim of claims) {
    const summary = await commands.prepare(claim);
    if (!summary) {
      result.superseded++;
      continue;
    }
    const outcome = await commands.send({ ...claim, summary });
    if (!(await commands.record(claim, outcome))) result.superseded++;
    else if (outcome.status === 'needs_action') result.attention++;
    else result[outcome.status]++;
  }
  return result;
}
