import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  razorpaySettings,
  toBillingEvent,
  verifyRazorpaySignature,
} from './razorpay.ts';

const secret = 'synthetic-webhook-secret';
const encode = (value: string) => new TextEncoder().encode(value);
// An independent HMAC implementation signs the exact raw bytes.
const sign = (body: string, key = secret) =>
  createHmac('sha256', key).update(body).digest('hex');
const plans = {
  monthly: { INR: 'plan_SyntheticMonINR', USD: 'plan_SyntheticMonUSD' },
  annual: { INR: 'plan_SyntheticAnnINR', USD: 'plan_SyntheticAnnUSD' },
};
const workspaceId = '28765529-6337-4512-b148-f735ad07d28b';
function payload(event: string, entity: Record<string, unknown> = {}) {
  return {
    entity: 'event',
    account_id: 'acc_Synthetic000001',
    event,
    contains: ['subscription'],
    created_at: 1794579000,
    payload: {
      subscription: {
        entity: {
          id: 'sub_Synthetic000001',
          entity: 'subscription',
          plan_id: 'plan_SyntheticAnnUSD',
          customer_id: 'cust_Synthetic00001',
          status: 'active',
          current_start: 1794579000,
          current_end: 1826115000,
          notes: { workspace_id: workspaceId },
          ...entity,
        },
      },
    },
  };
}

describe('webhook signature', () => {
  const body = JSON.stringify(payload('subscription.charged'));
  it('accepts the hex HMAC-SHA256 of the exact raw body', async () => {
    expect(
      await verifyRazorpaySignature(encode(body), sign(body), secret),
    ).toBe(true);
    expect(
      await verifyRazorpaySignature(
        encode(body),
        sign(body).toUpperCase(),
        secret,
      ),
    ).toBe(true);
  });
  it('rejects tampering, re-serialization, other secrets and malformed headers', async () => {
    const reformatted = JSON.stringify(JSON.parse(body), null, 1);
    for (const [raw, signature, key] of [
      [body + ' ', sign(body), secret],
      [reformatted, sign(body), secret],
      [body, sign(body, 'another-secret'), secret],
      [body, sign(body), ''],
      [body, null, secret],
      [body, '', secret],
      [body, sign(body).slice(1), secret],
      [body, 'z'.repeat(64), secret],
      [body, sign(body) + '00', secret],
    ] as const)
      expect(await verifyRazorpaySignature(encode(raw), signature, key)).toBe(
        false,
      );
    const oversized = 'x'.repeat(1048577);
    expect(
      await verifyRazorpaySignature(encode(oversized), sign(oversized), secret),
    ).toBe(false);
  });
});

describe('body limit', () => {
  it('verifies bodies up to exactly 1 MiB', async () => {
    const largest = 'x'.repeat(1048576);
    expect(
      await verifyRazorpaySignature(encode(largest), sign(largest), secret),
    ).toBe(true);
  });
});

describe('event mapping', () => {
  it('maps a configured plan to interval, currency and paid period', () => {
    expect(
      toBillingEvent(
        'evt_Synthetic01',
        payload('subscription.activated'),
        plans,
      ),
    ).toEqual({
      id: 'evt_Synthetic01',
      type: 'subscription.activated',
      createdAt: new Date(1794579000 * 1000),
      workspaceId,
      subscriptionId: 'sub_Synthetic000001',
      customerId: 'cust_Synthetic00001',
      interval: 'annual',
      currency: 'USD',
      periodStart: new Date(1794579000 * 1000),
      periodEnd: new Date(1826115000 * 1000),
    });
  });
  it('never grants a plan Snapform did not configure or trusts missing data', () => {
    expect(
      toBillingEvent(
        'evt_Synthetic02',
        payload('subscription.charged', {
          plan_id: 'plan_SomeoneElse0001',
          customer_id: null,
          current_start: null,
          current_end: null,
          notes: [],
        }),
        plans,
      ),
    ).toMatchObject({
      interval: null,
      currency: null,
      customerId: null,
      workspaceId: null,
      periodStart: null,
      periodEnd: null,
    });
    expect(
      toBillingEvent(
        'evt_Synthetic03',
        payload('subscription.halted', {
          notes: { workspace_id: 'not-a-workspace' },
          customer_id: 'someone',
        }),
        plans,
      ),
    ).toMatchObject({ workspaceId: null, customerId: null });
  });
  it('acknowledges unknown event types whatever their payload shape', () => {
    for (const [type, body] of [
      ['payment.captured', { payment: { entity: { id: 'pay_Synthetic01' } } }],
      ['subscription.updated', { subscription: { entity: { id: 42 } } }],
      ['invoice.paid', 'not an object'],
    ] as const)
      expect(
        toBillingEvent(
          'evt_Synthetic08',
          { ...payload(type), payload: body },
          plans,
        ),
      ).toEqual({
        id: 'evt_Synthetic08',
        type,
        createdAt: new Date(1794579000 * 1000),
        workspaceId: null,
        subscriptionId: null,
        customerId: null,
        interval: null,
        currency: null,
        periodStart: null,
        periodEnd: null,
      });
    // A handled event that does not match Razorpay's documented shape is refused.
    expect(
      toBillingEvent(
        'evt_Synthetic09',
        { ...payload('subscription.charged'), payload: {} },
        plans,
      ),
    ).toBeNull();
  });
  it('keeps unrelated events for dedupe without a subscription', () => {
    expect(
      toBillingEvent(
        'evt_Synthetic04',
        { ...payload('payment.captured'), payload: {} },
        plans,
      ),
    ).toMatchObject({ type: 'payment.captured', subscriptionId: null });
  });
  it('rejects events without a usable ID or shape', () => {
    for (const id of [null, '', 'evt with spaces', 'e'.repeat(65)])
      expect(
        toBillingEvent(id, payload('subscription.charged'), plans),
      ).toBeNull();
    for (const body of [
      null,
      'text',
      { ...payload('subscription.charged'), created_at: 'yesterday' },
      { ...payload('Subscription.Charged') },
      payload('subscription.charged', { id: 'plan_wrongKind00001' }),
    ])
      expect(toBillingEvent('evt_Synthetic05', body, plans)).toBeNull();
  });
});

describe('mode settings', () => {
  // Synthetic values only; the live-looking key never reaches Razorpay.
  const test = {
    SNAPFORM_ENV: 'development',
    RAZORPAY_MODE: 'test',
    RAZORPAY_KEY_ID: 'rzp_test_SyntheticKey01',
    RAZORPAY_KEY_SECRET: 'synthetic-test-secret',
    RAZORPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret',
    RAZORPAY_PLAN_PRO_MONTHLY_INR: 'plan_SyntheticMonINR',
    RAZORPAY_PLAN_PRO_ANNUAL_INR: 'plan_SyntheticAnnINR',
  };
  const live = {
    SNAPFORM_ENV: 'production',
    RAZORPAY_MODE: 'live',
    RAZORPAY_KEY_ID: 'rzp_live_SyntheticKey01',
    RAZORPAY_KEY_SECRET: 'synthetic-live-secret',
    RAZORPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret',
    RAZORPAY_LIVE_PLAN_PRO_MONTHLY_INR: 'plan_SyntheticLiveMon',
    RAZORPAY_LIVE_PLAN_PRO_ANNUAL_INR: 'plan_SyntheticLiveAnn',
  };
  it('reads test keys and test plans in test mode, INR only when USD is unset', () => {
    expect(razorpaySettings(test)).toEqual({
      mode: 'test',
      keyId: test.RAZORPAY_KEY_ID,
      keySecret: test.RAZORPAY_KEY_SECRET,
      webhookSecret: test.RAZORPAY_WEBHOOK_SECRET,
      currencies: ['INR'],
      plans: {
        monthly: { INR: 'plan_SyntheticMonINR' },
        annual: { INR: 'plan_SyntheticAnnINR' },
      },
    });
  });
  it('offers USD only when both USD plans exist in the current mode', () => {
    expect(
      razorpaySettings({
        ...test,
        RAZORPAY_PLAN_PRO_MONTHLY_USD: 'plan_SyntheticMonUSD',
        RAZORPAY_PLAN_PRO_ANNUAL_USD: 'plan_SyntheticAnnUSD',
      }),
    ).toMatchObject({
      currencies: ['INR', 'USD'],
      plans: {
        monthly: { INR: 'plan_SyntheticMonINR', USD: 'plan_SyntheticMonUSD' },
        annual: { INR: 'plan_SyntheticAnnINR', USD: 'plan_SyntheticAnnUSD' },
      },
    });
    // Live mode never borrows test plans, and the reverse.
    expect(
      razorpaySettings({
        ...live,
        RAZORPAY_PLAN_PRO_MONTHLY_USD: 'plan_SyntheticMonUSD',
        RAZORPAY_PLAN_PRO_ANNUAL_USD: 'plan_SyntheticAnnUSD',
      })?.currencies,
    ).toEqual(['INR']);
    expect(
      razorpaySettings({
        ...test,
        RAZORPAY_LIVE_PLAN_PRO_MONTHLY_INR: 'plan_SyntheticLiveMon',
        RAZORPAY_PLAN_PRO_MONTHLY_INR: undefined,
      }),
    ).toBeNull();
  });
  it('reads live keys and live plans only in production', () => {
    expect(razorpaySettings(live)).toMatchObject({
      mode: 'live',
      keyId: live.RAZORPAY_KEY_ID,
      plans: {
        monthly: { INR: 'plan_SyntheticLiveMon' },
        annual: { INR: 'plan_SyntheticLiveAnn' },
      },
    });
  });
  it('reports not configured for any mismatch instead of falling back', () => {
    for (const settings of [
      {},
      { ...test, RAZORPAY_MODE: undefined },
      { ...test, RAZORPAY_MODE: 'TEST' },
      { ...test, RAZORPAY_MODE: 'sandbox' },
      { ...test, RAZORPAY_KEY_ID: 'rzp_live_SyntheticKey01' },
      { ...test, RAZORPAY_KEY_ID: 'rzp_test_replace' },
      { ...test, RAZORPAY_KEY_SECRET: '' },
      { ...test, RAZORPAY_WEBHOOK_SECRET: 'short' },
      { ...test, RAZORPAY_PLAN_PRO_ANNUAL_INR: 'plan_replace' },
      { ...test, RAZORPAY_PLAN_PRO_MONTHLY_INR: undefined },
      { ...test, RAZORPAY_PLAN_PRO_MONTHLY_USD: 'plan_SyntheticMonUSD' },
      {
        ...test,
        RAZORPAY_PLAN_PRO_MONTHLY_USD: 'plan_SyntheticMonUSD',
        RAZORPAY_PLAN_PRO_ANNUAL_USD: 'plan_replace',
      },
      { ...live, RAZORPAY_KEY_ID: 'rzp_test_SyntheticKey01' },
      { ...live, SNAPFORM_ENV: 'development' },
      { ...live, SNAPFORM_ENV: undefined },
      { ...live, RAZORPAY_LIVE_PLAN_PRO_ANNUAL_INR: '' },
    ])
      expect(razorpaySettings(settings)).toBeNull();
  });
  it('matches webhook plans when only INR plans exist', () => {
    const inrOnly = razorpaySettings(live)?.plans;
    if (!inrOnly) throw Error('Expected settings');
    expect(
      toBillingEvent(
        'evt_Synthetic06',
        payload('subscription.charged', { plan_id: 'plan_SyntheticLiveAnn' }),
        inrOnly,
      ),
    ).toMatchObject({ interval: 'annual', currency: 'INR' });
    expect(
      toBillingEvent(
        'evt_Synthetic07',
        payload('subscription.charged'),
        inrOnly,
      ),
    ).toMatchObject({ interval: null, currency: null });
  });
});
