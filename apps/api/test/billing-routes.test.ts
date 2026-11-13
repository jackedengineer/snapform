import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { matchBillingRoute, billingFailures } from '../src/billing.ts';
import { razorpayConfig } from '../src/razorpay.ts';
import { intakeConflicts } from '../src/intake-routes.ts';
import { publicationFailures } from '../src/publication.ts';
import { isPrivatePath } from '../src/private-routes.ts';
import type { AuthEnvironment } from '../src/environment.ts';

const workspaceId = crypto.randomUUID();
const path = `/api/v1/workspaces/${workspaceId}/billing`;
const origin = 'http://127.0.0.1:5173';
const testBilling = {
  RAZORPAY_KEY_ID: 'rzp_test_SyntheticKey01',
  RAZORPAY_KEY_SECRET: 'synthetic-test-secret',
  RAZORPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret',
  RAZORPAY_PLAN_PRO_MONTHLY_INR: 'plan_SyntheticMonINR',
  RAZORPAY_PLAN_PRO_MONTHLY_USD: 'plan_SyntheticMonUSD',
  RAZORPAY_PLAN_PRO_ANNUAL_INR: 'plan_SyntheticAnnINR',
  RAZORPAY_PLAN_PRO_ANNUAL_USD: 'plan_SyntheticAnnUSD',
};
const environment = (values: Partial<AuthEnvironment>) =>
  values as AuthEnvironment;

it('matches only the UUID-scoped billing resource as a private path', () => {
  expect(matchBillingRoute(path)).toEqual({ workspaceId, action: 'read' });
  expect(matchBillingRoute(path + '/checkout')).toEqual({
    workspaceId,
    action: 'checkout',
  });
  expect(isPrivatePath(path + '/cancel')).toBe(true);
  expect(isPrivatePath(path)).toBe(true);
  for (const candidate of [
    path + '/',
    path + '/extra',
    path.replace(workspaceId, 'not-a-workspace'),
    '/api/v1/workspaces/billing',
  ])
    expect(matchBillingRoute(candidate)).toBeNull();
});

it('requires a verified account before reading plan usage or changing billing', async () => {
  for (const [suffix, method] of [
    ['', 'GET'],
    ['/checkout', 'POST'],
    ['/cancel', 'POST'],
  ] as const) {
    const response = await SELF.fetch(origin + path + suffix, {
      method,
      ...(method === 'POST'
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interval: 'monthly', currency: 'INR' }),
          }
        : {}),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
  }
});
it('refuses cross-site billing changes before authentication', async () => {
  const response = await SELF.fetch(origin + path + '/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://attacker.example',
      Cookie: 'better-auth.session_token=forged',
    },
    body: JSON.stringify({ interval: 'monthly', currency: 'INR' }),
  });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { code: 'ORIGIN_REJECTED' } });
});

it('maps plan limits to stable codes without leaking database detail', () => {
  expect(publicationFailures.get('LIVE_FORM_LIMIT')).toBe(409);
  expect(intakeConflicts.has('FORM_NOT_ACCEPTING')).toBe(true);
  expect(billingFailures.get('WORKSPACE_NOT_FOUND')).toBe(404);
  expect(billingFailures.get('FORBIDDEN')).toBe(403);
  expect(billingFailures.get('BILLING_ALREADY_ACTIVE')).toBe(409);
  expect(billingFailures.get('BILLING_NOT_CONFIGURED')).toBe(503);
});

it('configures billing only with a complete Razorpay test-mode setup', () => {
  expect(razorpayConfig(environment(testBilling))).toEqual({
    keyId: testBilling.RAZORPAY_KEY_ID,
    keySecret: testBilling.RAZORPAY_KEY_SECRET,
    webhookSecret: testBilling.RAZORPAY_WEBHOOK_SECRET,
    plans: {
      monthly: { INR: 'plan_SyntheticMonINR', USD: 'plan_SyntheticMonUSD' },
      annual: { INR: 'plan_SyntheticAnnINR', USD: 'plan_SyntheticAnnUSD' },
    },
  });
  expect(razorpayConfig(environment({}))).toBeNull();
  for (const change of [
    { RAZORPAY_KEY_ID: 'rzp_live_SyntheticKey01' },
    { RAZORPAY_KEY_ID: 'rzp_test_replace' },
    { RAZORPAY_KEY_SECRET: '' },
    { RAZORPAY_WEBHOOK_SECRET: '' },
    { RAZORPAY_PLAN_PRO_ANNUAL_USD: 'plan_replace' },
    { RAZORPAY_PLAN_PRO_MONTHLY_INR: undefined },
  ])
    expect(
      razorpayConfig(environment({ ...testBilling, ...change })),
    ).toBeNull();
});
