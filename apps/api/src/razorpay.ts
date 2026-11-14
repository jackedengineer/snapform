import {
  subscriptionIdSchema,
  type CheckoutInput,
} from '@snapform/contracts/billing';
import {
  createdSubscriptionSchema,
  razorpaySettings,
  type RazorpayConfig,
} from '@snapform/contracts/razorpay';
import type { AuthEnvironment } from './environment.ts';

// Razorpay Subscriptions API, in the configured test or live mode. Docs:
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
  const plan = config.plans[input.interval][input.currency];
  // USD plans are optional; never send Razorpay an empty plan.
  if (!plan) return Promise.reject(Error('BILLING_CURRENCY_UNAVAILABLE'));
  return call(
    config,
    subscriptions,
    {
      plan_id: plan,
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

export type { RazorpayConfig };
/**
 * Billing is configured only for one explicit RAZORPAY_MODE with matching keys
 * and that mode's plans (see contracts/razorpay.ts). A mismatch leaves billing
 * off, so the page says so instead of charging in the wrong mode.
 */
export function razorpayConfig(
  environment: AuthEnvironment,
): RazorpayConfig | null {
  return razorpaySettings(environment);
}
