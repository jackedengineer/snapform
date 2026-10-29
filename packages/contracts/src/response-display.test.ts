import { expect, it } from 'vitest';
import { formatResponseAnswer } from './response-display.ts';
import { formFixture } from '../test/form-fixture.ts';
it('preserves zero, explicit answer states and the labels in the published version', () => {
  const { definition, ids } = formFixture();
  const fields = definition.pages.flatMap((page) => page.blocks);
  const budget = fields.find((field) => field.type === 'number'),
    choice = fields.find((field) => field.type === 'single-choice'),
    text = fields.find((field) => field.type === 'long-text');
  if (!budget || !choice || !text) throw Error('Fixture fields required');
  expect(formatResponseAnswer(budget, { state: 'value', value: 0 })).toBe(
    'INR 0',
  );
  expect(
    formatResponseAnswer(choice, { state: 'value', value: ids.agency }),
  ).toBe('Agency');
  expect(
    formatResponseAnswer(text, {
      state: 'value',
      value: '<img src=x onerror=alert(1)>',
    }),
  ).toBe('<img src=x onerror=alert(1)>');
  for (const [state, expected] of [
    ['missing', 'Not answered'],
    ['blank', 'Left blank'],
    ['refused', 'Prefer not to answer'],
    ['not-applicable', 'Not applicable'],
  ] as const)
    expect(formatResponseAnswer(text, { state })).toBe(expected);
  expect(formatResponseAnswer(text, undefined)).toBe('Not answered');
});
it('formats choice arrays, booleans and number units without losing explicit false', () => {
  const { definition } = formFixture();
  const fields = definition.pages.flatMap((page) => page.blocks);
  const number = fields.find((field) => field.type === 'number'),
    choice = fields.find((field) => field.type === 'single-choice'),
    text = fields.find((field) => field.type === 'long-text');
  if (!number || !choice || !text) throw Error('Fixture fields required');
  expect(formatResponseAnswer(text, { state: 'value', value: false })).toBe(
    'No',
  );
  expect(formatResponseAnswer(text, { state: 'value', value: true })).toBe(
    'Yes',
  );
  expect(
    formatResponseAnswer(text, { state: 'value', value: ['a', 'b'] }),
  ).toBe('a\nb');
  expect(
    formatResponseAnswer(
      { ...number, unit: { kind: 'none' } },
      { state: 'value', value: 1.25 },
    ),
  ).toBe('1.25');
  expect(
    formatResponseAnswer(
      { ...number, unit: { kind: 'percent' } },
      { state: 'value', value: 0 },
    ),
  ).toBe('0%');
  expect(
    formatResponseAnswer(
      { ...number, unit: { kind: 'custom', label: 'hours' } },
      { state: 'value', value: 2 },
    ),
  ).toBe('2 hours');
  expect(
    formatResponseAnswer(
      {
        ...choice,
        type: 'multiple-choice',
        minSelections: 0,
        maxSelections: 2,
      },
      { state: 'value', value: choice.options.map((item) => item.id) },
    ),
  ).toBe('Agency\nStartup');
  expect(
    formatResponseAnswer(choice, { state: 'value', value: 'unknown' }),
  ).toBe('Unavailable choice');
});
