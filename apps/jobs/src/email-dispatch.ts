import type { OwnerEmailClaim } from '@snapform/database/notification-delivery';
import type { EmailOutcome } from '@snapform/contracts/notifications';

export async function dispatchOwnerEmails(commands: {
  claim: () => Promise<OwnerEmailClaim[]>;
  send: (claim: OwnerEmailClaim) => Promise<EmailOutcome>;
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
    const outcome = await commands.send(claim);
    if (!(await commands.record(claim, outcome))) result.superseded++;
    else if (outcome.status === 'needs_action') result.attention++;
    else result[outcome.status]++;
  }
  return result;
}
