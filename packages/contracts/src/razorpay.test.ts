import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { toBillingEvent, verifyRazorpaySignature } from './razorpay.ts';

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
    const oversized = 'x'.repeat(65537);
    expect(
      await verifyRazorpaySignature(encode(oversized), sign(oversized), secret),
    ).toBe(false);
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
