import { expect, it } from 'vitest';
import {
  billingRecordSchema,
  billingSummary,
  billingSummarySchema,
  checkoutInputSchema,
  checkoutSchema,
} from './billing.ts';

const record = {
  role: 'owner',
  plan: 'free',
  status: 'none',
  interval: null,
  currency: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  checkoutSubscription: null,
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
      checkoutSubscription: 'sub_00000000000001',
      liveFormLimit: null,
    }).liveFormLimit,
  ).toBeNull();
  for (const invalid of [
    { ...record, plan: 'enterprise' },
    { ...record, status: 'paused' },
    { ...record, responsesUsed: -1 },
    { ...record, checkoutSubscription: 'plan_00000000000001' },
    { ...record, razorpayCustomerId: 'cust_1' },
    { ...record, resetsAt: 'next month' },
  ])
    expect(billingRecordSchema.safeParse(invalid).success).toBe(false);
});

it('projects a summary without provider identifiers and adds plan features', () => {
  const summary = billingSummary(
    { ...record, checkoutSubscription: 'sub_00000000000001' },
    true,
  );
  expect(summary).not.toHaveProperty('checkoutSubscription');
  expect(summary).toMatchObject({
    configured: true,
    features: { badgeRequired: true, branding: false },
  });
  expect(billingSummarySchema.parse(summary)).toEqual(summary);
  expect(billingSummary({ ...record, plan: 'pro' }, false)).toMatchObject({
    configured: false,
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
  expect(
    checkoutSchema.safeParse({
      key: 'rzp_live_abc123',
      subscriptionId: 'sub_00000000000001',
    }).success,
  ).toBe(false);
});
