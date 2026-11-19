import { expect, it } from 'vitest';
import {
  billingSummarySchema,
  checkoutInputSchema,
  checkoutSchema,
} from './billing.ts';
import { billingRecordSchema, billingSummary } from './billing-server.ts';

const record = {
  role: 'owner',
  plan: 'free',
  status: 'none',
  interval: null,
  currency: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  subscriptionId: null,
  responsesUsed: 37,
  responsesReserved: 2,
  responseLimit: 100,
  liveForms: 2,
  liveFormLimit: 3,
  seatsUsed: 1,
  seatLimit: 1,
  resetsAt: '2026-12-01T00:00:00.000Z',
} as const;

it('reads the database projection strictly', () => {
  expect(billingRecordSchema.parse(record)).toEqual(record);
  expect(
    billingRecordSchema.parse({
      ...record,
      plan: 'pro',
      status: 'active',
      interval: 'annual',
      currency: 'INR',
      currentPeriodEnd: '2027-11-13T00:00:00.000Z',
      subscriptionId: 'sub_00000000000001',
      liveFormLimit: null,
    }).liveFormLimit,
  ).toBeNull();
  // Razorpay retries a failed charge while the subscription is pending.
  expect(
    billingRecordSchema.parse({ ...record, plan: 'pro', status: 'pending' })
      .status,
  ).toBe('pending');
  for (const invalid of [
    { ...record, plan: 'enterprise' },
    { ...record, status: 'paused' },
    { ...record, responsesUsed: -1 },
    { ...record, subscriptionId: 'plan_00000000000001' },
    { ...record, razorpayCustomerId: 'cust_1' },
    { ...record, resetsAt: 'next month' },
  ])
    expect(billingRecordSchema.safeParse(invalid).success).toBe(false);
});

it('projects a summary without provider identifiers and adds plan features', () => {
  const summary = billingSummary(
    { ...record, subscriptionId: 'sub_00000000000001' },
    ['INR'],
  );
  expect(summary).not.toHaveProperty('subscriptionId');
  expect(summary).toMatchObject({
    configured: true,
    currencies: ['INR'],
    features: { badgeRequired: true, branding: false },
  });
  expect(billingSummarySchema.parse(summary)).toEqual(summary);
  expect(billingSummary({ ...record, plan: 'pro' }, [])).toMatchObject({
    configured: false,
    currencies: [],
    features: { badgeRequired: false, embed: true },
  });
});

it('accepts only offered intervals and currencies for checkout', () => {
  expect(
    checkoutInputSchema.parse({ interval: 'monthly', currency: 'USD' }),
  ).toEqual({ interval: 'monthly', currency: 'USD' });
  for (const invalid of [
    {},
    { interval: 'weekly', currency: 'USD' },
    { interval: 'annual', currency: 'EUR' },
    { interval: 'annual', currency: 'INR', planId: 'plan_x' },
  ])
    expect(checkoutInputSchema.safeParse(invalid).success).toBe(false);
  expect(
    checkoutSchema.safeParse({
      key: 'rzp_test_abc123',
      subscriptionId: 'sub_00000000000001',
    }).success,
  ).toBe(true);
  // The server decides the mode; the browser accepts either kind of key.
  expect(
    checkoutSchema.safeParse({
      key: 'rzp_live_abc123',
      subscriptionId: 'sub_00000000000001',
    }).success,
  ).toBe(true);
  for (const key of ['rzp_abc123', 'rzp_prod_abc123', 'sk_live_abc123'])
    expect(
      checkoutSchema.safeParse({ key, subscriptionId: 'sub_00000000000001' })
        .success,
    ).toBe(false);
});
