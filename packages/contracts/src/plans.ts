// Plan rules shared by the API and browser. The database repeats these limits
// in migration 0041 (public.plan_limits); change both together.
export type PlanId = 'free' | 'pro';
export type BillingInterval = 'monthly' | 'annual';
export type BillingCurrency = 'INR' | 'USD';
export type Features = {
  branding: boolean;
  uploads: boolean;
  embed: boolean;
  badgeRequired: boolean;
};
type Plan = Features & {
  /** Published, collecting forms. null means no limit. */
  liveForms: number | null;
  /** Submitted responses per UTC calendar month, per workspace. */
  monthlyResponses: number;
  seats: number;
};
export const plans: Readonly<Record<PlanId, Readonly<Plan>>> = {
  free: {
    liveForms: 3,
    monthlyResponses: 100,
    seats: 1,
    branding: false,
    uploads: false,
    embed: false,
    badgeRequired: true,
  },
  pro: {
    liveForms: null,
    monthlyResponses: 2000,
    seats: 3,
    branding: true,
    uploads: true,
    embed: true,
    badgeRequired: false,
  },
};
/** Minor units (paise, cents). Annual is ten monthly payments: two months free. */
export const prices: Readonly<
  Record<BillingInterval, Readonly<Record<BillingCurrency, number>>>
> = {
  monthly: { INR: 149900, USD: 1900 },
  annual: { INR: 1499000, USD: 19000 },
};
/** Whole-unit display of a minor-unit amount, e.g. 149900 INR as ₹1,499. */
export function formatMoney(currency: BillingCurrency, minorUnits: number) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minorUnits / 100);
}
export function formatPrice(
  interval: BillingInterval,
  currency: BillingCurrency,
) {
  return formatMoney(currency, prices[interval][currency]);
}
/**
 * Response usage resets at 00:00 UTC on the first day of each calendar month,
 * for every workspace and viewer. The database uses the same UTC boundary.
 */
export function usageWindow(now: Date) {
  if (Number.isNaN(now.getTime())) throw new RangeError('Invalid time');
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)),
    resetsAt: new Date(Date.UTC(year, month + 1, 1)),
  };
}
/** Pro lasts exactly as long as a paid period; cancellation keeps it until then. */
export function effectivePlan(
  subscription: { plan: PlanId; currentPeriodEnd: Date | null } | null,
  now: Date,
): PlanId {
  return subscription?.plan === 'pro' &&
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd.getTime() > now.getTime()
    ? 'pro'
    : 'free';
}
function count(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Invalid count');
  return value;
}
/** A downgrade never unpublishes: already live forms stay updatable. */
export function canPublish(
  plan: PlanId,
  liveForms: number,
  alreadyLive: boolean,
) {
  const limit = plans[plan].liveForms;
  count(liveForms);
  return alreadyLive || limit === null || liveForms < limit;
}
/** Unexpired reservations hold capacity, so concurrent starts cannot overshoot. */
export function canAcceptResponse(
  plan: PlanId,
  used: number,
  reserved: number,
) {
  return count(used) + count(reserved) < plans[plan].monthlyResponses;
}
export function seatLimit(plan: PlanId) {
  return plans[plan].seats;
}
/**
 * What a public form shows respondents: the badge on Free, embedding on Pro.
 * An unknown plan (such as a lookup before migration 0045) gives nothing, so
 * the API leaves the flags out instead of guessing.
 */
export function publicPlanFlags(plan: unknown) {
  if (plan !== 'free' && plan !== 'pro') return undefined;
  return { badge: plans[plan].badgeRequired, embed: plans[plan].embed };
}
export function features(plan: PlanId): Features {
  const { branding, uploads, embed, badgeRequired } = plans[plan];
  return { branding, uploads, embed, badgeRequired };
}
