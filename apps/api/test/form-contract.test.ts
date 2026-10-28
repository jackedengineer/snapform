import { expect, it } from 'vitest';
import { blockSchema } from '@snapform/contracts/form';
import { decodeAnswer } from '@snapform/contracts/answers';
import { conditionSchema } from '@snapform/contracts/rules';
import { compileDefinition } from '@snapform/contracts/compile';
import { formFixture } from '../../../packages/contracts/test/form-fixture.ts';

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
it('rejects deep condition input without overflowing the Worker stack', () => {
  let condition: unknown = { op: 'answered', fieldId: crypto.randomUUID() };
  for (let i = 0; i < 10000; i++) condition = { op: 'not', condition };
  expect(conditionSchema.safeParse(condition).success).toBe(false);
});
it('compiles the same bounded definition fixture inside the Worker runtime', () => {
  expect(compileDefinition(formFixture().definition).ok).toBe(true);
});
