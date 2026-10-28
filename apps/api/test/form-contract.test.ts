import { expect, it } from 'vitest';
import { blockSchema } from '@snapform/contracts/form';
import { decodeAnswer } from '@snapform/contracts/answers';

it('validates native currency and Unicode contracts inside workerd', () => {
  const value = {
    id: crypto.randomUUID(),
    type: 'number',
    label: 'Budget',
    description: '',
    required: true,
    aiEnabled: false,
    unit: { kind: 'currency', code: 'INR' },
    min: 0,
  };
  expect(blockSchema.safeParse(value).success).toBe(true);
  const field = blockSchema.parse(value);
  if (field.type !== 'number') throw new Error('Expected a number field');
  expect(decodeAnswer(field, { state: 'value', value: '0' })).toEqual({
    ok: true,
    answer: { state: 'value', value: 0 },
  });
  expect(decodeAnswer(field, { state: 'not-applicable' }).ok).toBe(false);
  expect(
    blockSchema.safeParse({ ...value, unit: { kind: 'currency', code: 'ZZZ' } })
      .success,
  ).toBe(false);
  expect(blockSchema.safeParse({ ...value, label: '\ud800' }).success).toBe(
    false,
  );
});
