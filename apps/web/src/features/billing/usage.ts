import type { BillingSummary } from '@snapform/contracts/billing';
import { plans } from '@snapform/contracts/plans';

const counts = new Intl.NumberFormat('en');
// Usage resets at 00:00 UTC, so the reset day is shown in UTC too.
export const resetDay = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
export const longDate = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  timeZone: 'UTC',
});
type Usage = Pick<
  BillingSummary,
  'responsesUsed' | 'responseLimit' | 'liveForms' | 'liveFormLimit'
>;
export function usageLine(usage: Usage) {
  const forms =
    usage.liveFormLimit === null
      ? `${counts.format(usage.liveForms)} live ${usage.liveForms === 1 ? 'form' : 'forms'}`
      : `${counts.format(usage.liveForms)} of ${counts.format(usage.liveFormLimit)} live forms`;
  return `${counts.format(usage.responsesUsed)} of ${counts.format(usage.responseLimit)} responses this month · ${forms}`;
}
export function limitNotice(billing: BillingSummary) {
  const resets = resetDay.format(new Date(billing.resetsAt));
  if (billing.responsesUsed >= billing.responseLimit)
    return (
      `Your forms aren’t accepting responses until ${resets}.` +
      (billing.plan === 'free'
        ? ` Upgrade to Pro for ${counts.format(plans.pro.monthlyResponses)} responses a month.`
        : '')
    );
  if (
    billing.responsesUsed + billing.responsesReserved >=
    billing.responseLimit
  )
    return `Your forms aren’t accepting new responses until people finish the ones in progress or the limit resets on ${resets}.`;
  if (
    billing.liveFormLimit !== null &&
    billing.liveForms >= billing.liveFormLimit
  )
    return `You have ${billing.liveForms} of ${billing.liveFormLimit} live forms. Stop collecting on one, or upgrade to Pro, to publish another.`;
  return null;
}
export function planStatus(billing: BillingSummary) {
  const kept = 'Live forms stay live.';
  // Razorpay retries a failed renewal; Pro stays for up to 30 days past the
  // paid period while it does (0047).
  if (billing.status === 'pending')
    return billing.plan === 'pro'
      ? 'Payment failed: update your card. Pro stays on while Razorpay retries the payment.'
      : `Payment failed: update your card. Razorpay is retrying the payment; this workspace is on Free until it succeeds. ${kept}`;
  if (billing.plan === 'pro') {
    const end = longDate.format(new Date(billing.currentPeriodEnd ?? 0));
    return billing.status === 'active' && !billing.cancelAtPeriodEnd
      ? `Pro renews on ${end}.`
      : `Pro until ${end}, then Free. ${kept}`;
  }
  if (billing.status === 'created')
    return 'This workspace is on Free. Checkout wasn’t finished.';
  if (billing.status === 'halted')
    return `Razorpay couldn’t take the last Pro payment, so this workspace is on Free. ${kept}`;
  if (billing.status !== 'none')
    return `Pro has ended, so this workspace is on Free. ${kept}`;
  return 'This workspace is on Free.';
}
