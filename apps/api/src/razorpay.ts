import type {
  BillingCurrency,
  BillingInterval,
} from '@snapform/contracts/plans';
import {
  subscriptionIdSchema,
  type CheckoutInput,
} from '@snapform/contracts/billing';
import { createdSubscriptionSchema } from '@snapform/contracts/razorpay';
import type { AuthEnvironment } from './environment.ts';

// Razorpay Subscriptions API, test mode. Docs:
// https://razorpay.com/docs/api/payments/subscriptions/create-subscription/
// https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription/
const subscriptions = 'https://api.razorpay.com/v1/subscriptions';
async function call(
  config: RazorpayConfig,
  url: string,
  body: unknown,
  fetcher: typeof fetch,
) {
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${config.keyId}:${config.keySecret}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // Workers support only follow or manual; a redirect is then not ok.
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error(String(response.status));
    return createdSubscriptionSchema.parse(await response.json()).id;
  } catch (error) {
    // Provider bodies can echo customer details; log only the failure class.
    console.error(
      JSON.stringify({
        event: 'billing_provider_failed',
        status:
          error instanceof Error && /^\d{3}$/.test(error.message)
            ? Number(error.message)
            : null,
      }),
    );
    throw Error('BILLING_PROVIDER_UNAVAILABLE', { cause: error });
  }
}
/** Creates an unpaid subscription for Checkout. Notes let webhooks find the workspace. */
export function createSubscription(
  config: RazorpayConfig,
  input: CheckoutInput,
  workspaceId: string,
  fetcher: typeof fetch = fetch,
) {
  return call(
    config,
    subscriptions,
    {
      plan_id: config.plans[input.interval][input.currency],
      // Billing cycles until Razorpay completes it: ten years either way.
      total_count: input.interval === 'annual' ? 10 : 120,
      notes: { workspace_id: workspaceId },
    },
    fetcher,
  );
}
/** Pro continues until the paid cycle ends; Razorpay then sends subscription.cancelled. */
export function cancelSubscription(
  config: RazorpayConfig,
  subscriptionId: string,
  fetcher: typeof fetch = fetch,
) {
  return call(
    config,
    `${subscriptions}/${encodeURIComponent(subscriptionIdSchema.parse(subscriptionId))}/cancel`,
    { cancel_at_cycle_end: true },
    fetcher,
  );
}

const testKey = /^rzp_test_[A-Za-z0-9]{10,30}$/,
  planId = /^plan_[A-Za-z0-9]{10,30}$/;
export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  plans: Record<BillingInterval, Record<BillingCurrency, string>>;
};
/**
 * Billing is configured only with a complete test-mode setup. A live key or a
 * placeholder plan leaves it off, so the page says so instead of charging.
 */
export function razorpayConfig(
  environment: AuthEnvironment,
): RazorpayConfig | null {
  const {
    RAZORPAY_KEY_ID: keyId = '',
    RAZORPAY_KEY_SECRET: keySecret = '',
    RAZORPAY_WEBHOOK_SECRET: webhookSecret = '',
    RAZORPAY_PLAN_PRO_MONTHLY_INR: monthlyInr = '',
    RAZORPAY_PLAN_PRO_MONTHLY_USD: monthlyUsd = '',
    RAZORPAY_PLAN_PRO_ANNUAL_INR: annualInr = '',
    RAZORPAY_PLAN_PRO_ANNUAL_USD: annualUsd = '',
  } = environment;
  if (
    !testKey.test(keyId) ||
    keySecret.length < 8 ||
    webhookSecret.length < 8 ||
    ![monthlyInr, monthlyUsd, annualInr, annualUsd].every((id) =>
      planId.test(id),
    )
  )
    return null;
  return {
    keyId,
    keySecret,
    webhookSecret,
    plans: {
      monthly: { INR: monthlyInr, USD: monthlyUsd },
      annual: { INR: annualInr, USD: annualUsd },
    },
  };
}
