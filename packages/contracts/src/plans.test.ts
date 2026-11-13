import { describe, expect, it } from 'vitest';
import {
  canAcceptResponse,
  canPublish,
  effectivePlan,
  features,
  formatPrice,
  plans,
  prices,
  seatLimit,
  usageWindow,
} from './plans.ts';

describe('plan limits', () => {
  it('keeps the decided Free and Pro allowances', () => {
    expect(plans.free).toMatchObject({
      liveForms: 3,
      monthlyResponses: 100,
      seats: 1,
    });
    expect(plans.pro).toMatchObject({
      liveForms: null,
      monthlyResponses: 2000,
      seats: 3,
    });
    expect(seatLimit('free')).toBe(1);
    expect(seatLimit('pro')).toBe(3);
  });
  it('flags only Pro for branding, uploads and embed, and badges Free forms', () => {
    expect(features('free')).toEqual({
      branding: false,
      uploads: false,
      embed: false,
      badgeRequired: true,
    });
    expect(features('pro')).toEqual({
      branding: true,
      uploads: true,
      embed: true,
      badgeRequired: false,
    });
  });
  it('prices annual billing at ten monthly payments', () => {
    expect(prices.monthly).toEqual({ INR: 149900, USD: 1900 });
    expect(prices.annual).toEqual({ INR: 1499000, USD: 19000 });
    for (const currency of ['INR', 'USD'] as const)
      expect(prices.annual[currency]).toBe(prices.monthly[currency] * 10);
    expect(formatPrice('monthly', 'INR')).toBe('₹1,499');
    expect(formatPrice('annual', 'INR')).toBe('₹14,990');
    expect(formatPrice('monthly', 'USD')).toBe('$19');
    expect(formatPrice('annual', 'USD')).toBe('$190');
  });
});

describe('usage window', () => {
  it('uses the UTC calendar month regardless of the viewer time zone', () => {
    expect(usageWindow(new Date('2026-11-13T10:00:00Z'))).toEqual({
      start: new Date('2026-11-01T00:00:00Z'),
      resetsAt: new Date('2026-12-01T00:00:00Z'),
    });
    // 23:30 on 30 November in UTC is already 1 December in India.
    expect(usageWindow(new Date('2026-11-30T23:30:00Z')).start).toEqual(
      new Date('2026-11-01T00:00:00Z'),
    );
    expect(usageWindow(new Date('2026-12-01T00:00:00Z')).start).toEqual(
      new Date('2026-12-01T00:00:00Z'),
    );
  });
  it('rolls December into the next year and handles leap February', () => {
    expect(usageWindow(new Date('2026-12-31T23:59:59.999Z'))).toEqual({
      start: new Date('2026-12-01T00:00:00Z'),
      resetsAt: new Date('2027-01-01T00:00:00Z'),
    });
    expect(usageWindow(new Date('2028-02-29T12:00:00Z')).resetsAt).toEqual(
      new Date('2028-03-01T00:00:00Z'),
    );
  });
  it('refuses an invalid clock instead of inventing a window', () => {
    expect(() => usageWindow(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe('effective plan', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  it('grants Pro only through a paid period that has not ended', () => {
    expect(effectivePlan(null, now)).toBe('free');
    expect(
      effectivePlan(
        { plan: 'pro', currentPeriodEnd: new Date('2026-12-13T00:00:00Z') },
        now,
      ),
    ).toBe('pro');
    expect(effectivePlan({ plan: 'pro', currentPeriodEnd: now }, now)).toBe(
      'free',
    );
    expect(effectivePlan({ plan: 'pro', currentPeriodEnd: null }, now)).toBe(
      'free',
    );
    expect(
      effectivePlan(
        { plan: 'free', currentPeriodEnd: new Date('2027-01-01T00:00:00Z') },
        now,
      ),
    ).toBe('free');
  });
});

describe('publishing', () => {
  it('lets Free publish up to three live forms', () => {
    expect(canPublish('free', 0, false)).toBe(true);
    expect(canPublish('free', 2, false)).toBe(true);
    expect(canPublish('free', 3, false)).toBe(false);
  });
  it('keeps already live forms updatable after a downgrade', () => {
    expect(canPublish('free', 7, true)).toBe(true);
    expect(canPublish('free', 7, false)).toBe(false);
  });
  it('does not limit Pro live forms', () => {
    expect(canPublish('pro', 10000, false)).toBe(true);
  });
  it('rejects impossible counts', () => {
    expect(() => canPublish('free', -1, false)).toThrow(RangeError);
    expect(() => canPublish('free', 1.5, false)).toThrow(RangeError);
  });
});

describe('responses', () => {
  it('counts unexpired reservations against the monthly allowance', () => {
    expect(canAcceptResponse('free', 0, 0)).toBe(true);
    expect(canAcceptResponse('free', 99, 0)).toBe(true);
    expect(canAcceptResponse('free', 100, 0)).toBe(false);
    expect(canAcceptResponse('free', 90, 10)).toBe(false);
    expect(canAcceptResponse('free', 90, 9)).toBe(true);
    expect(canAcceptResponse('pro', 1999, 0)).toBe(true);
    expect(canAcceptResponse('pro', 1000, 1000)).toBe(false);
  });
  it('accepts up to the Free allowance after a downgrade', () => {
    expect(canAcceptResponse('free', 150, 0)).toBe(false);
  });
  it('rejects impossible counts', () => {
    expect(() => canAcceptResponse('free', -1, 0)).toThrow(RangeError);
    expect(() => canAcceptResponse('free', 0, Number.NaN)).toThrow(RangeError);
  });
});
