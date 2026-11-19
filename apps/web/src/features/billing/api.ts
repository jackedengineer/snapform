import {
  billingOptionsSchema,
  billingSummarySchema,
  checkoutSchema,
  type CheckoutInput,
} from '@snapform/contracts/billing';
import type { BillingCurrency } from '@snapform/contracts/plans';

export const billingQueryKey = (userId: string, workspaceId: string) => [
  'billing',
  userId,
  workspaceId,
];
export const billingPath = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/billing`;
const failures: Record<string, string> = {
  BILLING_NOT_CONFIGURED: 'Billing isn’t configured yet.',
  BILLING_ALREADY_ACTIVE: 'This workspace already has Pro.',
  BILLING_PAYMENT_PENDING:
    'Razorpay is retrying your last payment. Update your card instead.',
  BILLING_NOT_PENDING:
    'Your last payment went through, so there’s no card to update.',
  FORBIDDEN: 'Only the workspace owner can change the plan.',
  BILLING_CURRENCY_UNAVAILABLE: 'That currency isn’t available. Choose INR.',
  BILLING_PROVIDER_UNAVAILABLE:
    'Razorpay didn’t respond, so nothing changed. Try again.',
};
async function request(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<unknown> {
  let code: unknown = null;
  try {
    const response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    });
    const body: unknown = await response.json();
    if (response.ok) return body;
    if (body && typeof body === 'object' && 'error' in body) {
      const error = body.error;
      if (error && typeof error === 'object' && 'code' in error)
        code = error.code;
    }
  } catch {
    // Network or body failures fall through to the same plain message.
  }
  throw Error((typeof code === 'string' && failures[code]) || fallback);
}
const field = (body: unknown, key: string) =>
  body && typeof body === 'object' && key in body
    ? (body as Record<string, unknown>)[key]
    : null;
export async function fetchBilling(workspaceId: string, signal?: AbortSignal) {
  const failure = 'We couldn’t load this workspace’s plan.';
  const body = await request(
    billingPath(workspaceId),
    {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    },
    failure,
  );
  const billing = billingSummarySchema.safeParse(field(body, 'billing'));
  if (!billing.success) throw Error(failure);
  return billing.data;
}
const changeFailure = 'We couldn’t confirm that billing change. Try again.';
function change(workspaceId: string, action: string, input: object) {
  return request(
    billingPath(workspaceId) + '/' + action,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20000),
    },
    changeFailure,
  );
}
export async function startCheckout(workspaceId: string, input: CheckoutInput) {
  const checkout = checkoutSchema.safeParse(
    field(await change(workspaceId, 'checkout', input), 'checkout'),
  );
  if (!checkout.success) throw Error(changeFailure);
  return checkout.data;
}
/** Opens Razorpay's card change for the subscription whose charge failed. */
export async function startCardUpdate(workspaceId: string) {
  const checkout = checkoutSchema.safeParse(
    field(await change(workspaceId, 'card', {}), 'checkout'),
  );
  if (!checkout.success) throw Error(changeFailure);
  return checkout.data;
}
export async function cancelPlan(workspaceId: string) {
  await change(workspaceId, 'cancel', {});
}
/**
 * Currencies /pricing may show. INR always has plans; USD appears only when the
 * server confirms USD plans in its current mode, so no toggle leads nowhere.
 */
export async function fetchBillingOptions(
  signal?: AbortSignal,
): Promise<BillingCurrency[]> {
  try {
    const options = billingOptionsSchema.safeParse(
      await request(
        '/api/v1/billing/options',
        {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
            : AbortSignal.timeout(10000),
        },
        '',
      ),
    );
    if (options.success && options.data.currencies.includes('USD'))
      return ['INR', 'USD'];
  } catch {
    // Pricing still shows INR, which every configured mode offers.
  }
  return ['INR'];
}
