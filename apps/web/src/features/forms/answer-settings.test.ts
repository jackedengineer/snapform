import { expect, it } from 'vitest';
import { newBlock } from './new-form';
import { readAnswerSettings } from './answer-settings';
import type { Block } from '@snapform/contracts/form';
function settings(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
it('preserves zero, negative and decimal bounds while retaining field identity', () => {
  const block = newBlock('number');
  const parsed = readAnswerSettings(
    block,
    settings({ min: '-12.5', max: '0', unit: 'percent' }),
  );
  expect(parsed).toMatchObject({
    id: block.id,
    min: -12.5,
    max: 0,
    unit: { kind: 'percent' },
  });
  expect(block).not.toHaveProperty('min');
});
it('clears optional bounds and supports ISO currencies and literal custom units', () => {
  const block = { ...newBlock('number'), min: 5, max: 10 } as Block;
  const parsed = readAnswerSettings(
    block,
    settings({ min: '', max: '', unit: 'currency', currency: 'JPY' }),
  );
  expect(parsed).toMatchObject({ unit: { kind: 'currency', code: 'JPY' } });
  expect(parsed).not.toHaveProperty('min');
  expect(parsed).not.toHaveProperty('max');
  expect(
    readAnswerSettings(
      block,
      settings({
        min: '',
        max: '',
        unit: 'custom',
        customUnit: 'hours / week',
      }),
    ),
  ).toMatchObject({ unit: { kind: 'custom', label: 'hours / week' } });
});
it('enforces structural bounds for text, choices, dates and files', () => {
  expect(
    readAnswerSettings(
      newBlock('short-text'),
      settings({ minLength: '0', maxLength: '500' }),
    ),
  ).toMatchObject({ minLength: 0, maxLength: 500 });
  expect(
    readAnswerSettings(
      newBlock('long-text'),
      settings({ minLength: '0', maxLength: '10000' }),
    ),
  ).toMatchObject({ maxLength: 10000 });
  expect(
    readAnswerSettings(
      newBlock('multiple-choice'),
      settings({ minSelections: '0', maxSelections: '20' }),
    ),
  ).toMatchObject({ minSelections: 0, maxSelections: 20 });
  expect(
    readAnswerSettings(
      newBlock('date'),
      settings({ min: '2026-10-29', max: '' }),
    ),
  ).toMatchObject({ min: '2026-10-29' });
  expect(
    readAnswerSettings(newBlock('file'), settings({ maxFiles: '3' })),
  ).toMatchObject({ maxFiles: 3, aiEnabled: false });
});
it('rejects malformed, ambiguous, duplicate and forged settings without mutating the block', () => {
  const number = newBlock('number');
  for (const min of [' ', 'NaN', 'Infinity', '1,000', '--1'])
    expect(
      readAnswerSettings(number, settings({ min, max: '', unit: 'none' })),
    ).toBeNull();
  expect(
    readAnswerSettings(
      number,
      settings({ min: '', max: '', unit: 'currency', currency: 'ZZZ' }),
    ),
  ).toBeNull();
  expect(
    readAnswerSettings(
      newBlock('short-text'),
      settings({ minLength: '0', maxLength: '501' }),
    ),
  ).toBeNull();
  expect(
    readAnswerSettings(
      newBlock('date'),
      settings({ min: '2026-02-30', max: '' }),
    ),
  ).toBeNull();
  expect(
    readAnswerSettings(newBlock('file'), settings({ maxFiles: '4' })),
  ).toBeNull();
  expect(
    readAnswerSettings(
      newBlock('short-text'),
      settings({ minLength: '0', maxLength: '20', id: crypto.randomUUID() }),
    ),
  ).toBeNull();
  const duplicate = settings({ minLength: '0', maxLength: '20' });
  duplicate.append('maxLength', '30');
  expect(readAnswerSettings(newBlock('short-text'), duplicate)).toBeNull();
  expect(
    readAnswerSettings(
      newBlock('email'),
      settings({ minLength: '0', maxLength: '20' }),
    ),
  ).toBeNull();
});
