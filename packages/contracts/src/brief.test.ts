import { describe, expect, it } from 'vitest';
import { briefFormSchema, briefSchema, reviewResponseSchema } from './brief';

const valid = {
  goal: 'A website that explains our services.',
  budget: 7500,
  currency: 'USD',
  targetDate: '2027-01-15',
};

describe('brief validation contract', () => {
  it('normalizes surrounding whitespace without changing the meaning', () => {
    expect(briefSchema.parse({ ...valid, goal: `  ${valid.goal}  ` })).toEqual(
      valid,
    );
  });
  it('preserves a zero budget instead of treating it as missing', () => {
    expect(briefSchema.parse({ ...valid, budget: 0 }).budget).toBe(0);
  });
  it.each([-1, 0.5, 10_000_001, Infinity, NaN, '7500', null])(
    'rejects an invalid whole-unit budget: %s',
    (budget) => {
      expect(briefSchema.safeParse({ ...valid, budget }).success).toBe(false);
    },
  );
  it.each(['', 'short', ' '.repeat(20), 'x'.repeat(1001)])(
    'rejects an empty or unbounded goal',
    (goal) => {
      expect(briefSchema.safeParse({ ...valid, goal }).success).toBe(false);
    },
  );
  it.each([
    '2027-02-29',
    '2027-02-30',
    '2027-13-01',
    '01/15/2027',
    '2027-01-15T00:00:00Z',
    '',
  ])('rejects invalid or ambiguous calendar dates: %s', (targetDate) => {
    expect(briefSchema.safeParse({ ...valid, targetDate }).success).toBe(false);
  });
  it('accepts a valid leap day as a calendar date', () => {
    expect(
      briefSchema.parse({ ...valid, targetDate: '2028-02-29' }).targetDate,
    ).toBe('2028-02-29');
  });
  it.each(['USD', 'INR', 'EUR'])(
    'requires and preserves an explicit supported currency: %s',
    (currency) => {
      expect(briefSchema.parse({ ...valid, currency }).currency).toBe(currency);
    },
  );
  it('rejects unsupported currency and extra authority-bearing fields', () => {
    expect(briefSchema.safeParse({ ...valid, currency: 'ZZZ' }).success).toBe(
      false,
    );
    expect(
      briefSchema.safeParse({ ...valid, workspaceId: 'another-workspace' })
        .success,
    ).toBe(false);
  });
  it('keeps input as text instead of interpreting markup', () => {
    const goal = '<script>alert("synthetic")</script> A useful project.';
    expect(briefSchema.parse({ ...valid, goal }).goal).toBe(goal);
  });
});

describe('native form boundary', () => {
  it('converts validated whole-unit text to a numeric budget', () => {
    expect(briefFormSchema.parse({ ...valid, budget: '7500' })).toEqual(valid);
  });
  it.each(['', ' ', '-1', '0.1', '1e3', 'Infinity', '7500USD'])(
    'rejects ambiguous numeric form text: %s',
    (budget) => {
      expect(briefFormSchema.safeParse({ ...valid, budget }).success).toBe(
        false,
      );
    },
  );
  it('retains zero from a native number input', () => {
    expect(briefFormSchema.parse({ ...valid, budget: '0' }).budget).toBe(0);
  });
  it('rejects a response claiming an unknown or persisted output shape', () => {
    expect(
      reviewResponseSchema.safeParse({ brief: valid, saved: true }).success,
    ).toBe(false);
    expect(reviewResponseSchema.parse({ brief: valid })).toEqual({
      brief: valid,
    });
  });
});
