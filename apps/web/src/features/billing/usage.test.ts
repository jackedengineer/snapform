import { expect, it } from 'vitest';
import type { BillingSummary } from '@snapform/contracts/billing';
import { limitNotice, planStatus, usageLine } from './usage';

const free: BillingSummary = {
  role: 'owner',
  plan: 'free',
  status: 'none',
  interval: null,
  currency: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  responsesUsed: 37,
  responsesReserved: 0,
  responseLimit: 100,
  liveForms: 2,
  liveFormLimit: 3,
  seatsUsed: 1,
  seatLimit: 1,
  resetsAt: '2026-12-01T00:00:00.000Z',
  configured: true,
  features: {
    branding: false,
    uploads: false,
    embed: false,
    badgeRequired: true,
  },
};
const pro: BillingSummary = {
  ...free,
  plan: 'pro',
  status: 'active',
  interval: 'monthly',
  currency: 'INR',
  currentPeriodEnd: '2026-12-13T09:30:00.000Z',
  responsesUsed: 1234,
  responseLimit: 2000,
  liveForms: 1,
  liveFormLimit: null,
};

it('summarizes monthly responses and live forms in one line', () => {
  expect(usageLine(free)).toBe(
    '37 of 100 responses this month · 2 of 3 live forms',
  );
  expect(usageLine(pro)).toBe(
    '1,234 of 2,000 responses this month · 1 live form',
  );
  expect(usageLine({ ...pro, liveForms: 12 })).toBe(
    '1,234 of 2,000 responses this month · 12 live forms',
  );
});

it('explains a reached limit and when collection resumes', () => {
  expect(limitNotice(free)).toBeNull();
  expect(limitNotice({ ...free, responsesUsed: 100 })).toBe(
    'Your forms aren’t accepting responses until 1 December. Upgrade to Pro for 2,000 responses a month.',
  );
  expect(
    limitNotice({ ...free, responsesUsed: 95, responsesReserved: 5 }),
  ).toBe(
    'Your forms aren’t accepting new responses until people finish the ones in progress or the limit resets on 1 December.',
  );
  expect(limitNotice({ ...pro, responsesUsed: 2000 })).toBe(
    'Your forms aren’t accepting responses until 1 December.',
  );
  expect(limitNotice({ ...free, liveForms: 3 })).toBe(
    'You have 3 of 3 live forms. Stop collecting on one, or upgrade to Pro, to publish another.',
  );
  expect(limitNotice({ ...free, liveForms: 5 })).toBe(
    'You have 5 of 3 live forms. Stop collecting on one, or upgrade to Pro, to publish another.',
  );
});

it('describes the plan honestly through cancellation and failed payment', () => {
  expect(planStatus(free)).toBe('This workspace is on Free.');
  expect(planStatus({ ...free, status: 'created' })).toBe(
    'This workspace is on Free. Checkout wasn’t finished.',
  );
  expect(planStatus(pro)).toBe('Pro renews on 13 December 2026.');
  expect(planStatus({ ...pro, cancelAtPeriodEnd: true })).toBe(
    'Pro until 13 December 2026, then Free. Live forms stay live.',
  );
  expect(planStatus({ ...pro, status: 'cancelled' })).toBe(
    'Pro until 13 December 2026, then Free. Live forms stay live.',
  );
  expect(planStatus({ ...free, status: 'halted' })).toBe(
    'Razorpay couldn’t take the last Pro payment, so this workspace is on Free. Live forms stay live.',
  );
  expect(planStatus({ ...free, status: 'cancelled' })).toBe(
    'Pro has ended, so this workspace is on Free. Live forms stay live.',
  );
});
