import type {
  BillingCurrency,
  BillingInterval,
} from '@snapform/contracts/plans';
import type { AuthEnvironment } from './environment.ts';

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
