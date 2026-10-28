import { expect, it } from 'vitest';
import { blockSchema } from './form.ts';
import type { Field } from './form.ts';
import { decodeAnswer, requiredAnswerIssue } from './answers.ts';

function field(
  type: Field['type'],
  extra: Record<string, unknown> = {},
): Field {
  const block = blockSchema.parse({
    id: crypto.randomUUID(),
    type,
    label: 'Question',
    description: '',
    required: false,
    aiEnabled: false,
    ...extra,
  });
  if (block.type === 'heading' || block.type === 'help')
    throw new Error('Expected a field');
  return block;
}
const value = (input: unknown) => ({ state: 'value', value: input });
const shortText = () => field('short-text', { minLength: 2, maxLength: 500 });

it('distinguishes zero, false, blank, missing and refusal', () => {
  const number = field('number', { unit: { kind: 'none' } });
  expect(decodeAnswer(number, value('0'))).toEqual({
    ok: true,
    answer: value(0),
  });
  const acknowledgment = field('acknowledgment');
  expect(decodeAnswer(acknowledgment, value(false))).toEqual({
    ok: true,
    answer: value(false),
  });
  for (const state of ['missing', 'blank', 'refused'])
    expect(decodeAnswer(number, { state })).toEqual({
      ok: true,
      answer: { state },
    });
  expect(decodeAnswer(number, undefined)).toEqual({
    ok: true,
    answer: { state: 'missing' },
  });
  expect(decodeAnswer(shortText(), value(' \n '))).toEqual({
    ok: true,
    answer: { state: 'blank' },
  });
  expect(decodeAnswer(number, { state: 'not-applicable' }).ok).toBe(false);
  expect(decodeAnswer(number, { state: 'blank', value: 12 }).ok).toBe(false);
});
it('preserves text evidence while normalizing line endings and validating bounds', () => {
  expect(decodeAnswer(shortText(), value(' A\r\nB\rC '))).toEqual({
    ok: true,
    answer: value(' A\nB\nC '),
  });
  expect(
    decodeAnswer(
      field('long-text', { minLength: 0, maxLength: 10000 }),
      value('x'.repeat(10000)),
    ).ok,
  ).toBe(true);
  for (const input of [
    'a',
    'x'.repeat(501),
    'A\0B',
    'A\ud800B',
    3,
    false,
    ['text'],
  ])
    expect(decodeAnswer(shortText(), value(input)).ok).toBe(false);
});
it('normalizes email domains without changing the local part', () => {
  const email = field('email');
  expect(decodeAnswer(email, value('  Person@EXAMPLE.COM  '))).toEqual({
    ok: true,
    answer: value('Person@example.com'),
  });
  for (const input of [
    'invalid',
    'a@b',
    0,
    true,
    'a'.repeat(255) + '@example.com',
  ])
    expect(decodeAnswer(email, value(input)).ok).toBe(false);
});
it('accepts safe explicit decimals and rejects ambiguous or out-of-range numbers', () => {
  const number = field('number', {
    unit: { kind: 'currency', code: 'INR' },
    min: 0,
    max: 5000,
  });
  for (const input of [0, 12.5, '12.50', ' 12.5 '])
    expect(decodeAnswer(number, value(input)).ok).toBe(true);
  for (const input of [
    '1,000',
    '1e3',
    '₹12',
    'Infinity',
    Infinity,
    NaN,
    -1,
    5001,
    true,
    [],
  ])
    expect(decodeAnswer(number, value(input)).ok).toBe(false);
  const unbounded = field('number', { unit: { kind: 'none' } });
  expect(decodeAnswer(unbounded, value(Number.MAX_SAFE_INTEGER + 1)).ok).toBe(
    false,
  );
  expect(decodeAnswer(unbounded, value(-12)).ok).toBe(true);
});
it('keeps local dates timezone-free and validates actual calendar bounds', () => {
  const date = field('date', { min: '2024-02-29', max: '2028-02-29' });
  expect(decodeAnswer(date, value('2024-02-29'))).toEqual({
    ok: true,
    answer: value('2024-02-29'),
  });
  for (const input of [
    '2025-02-29',
    '2024-02-28',
    '2028-03-01',
    '2026-10-28T00:00:00Z',
    20261028,
  ])
    expect(decodeAnswer(date, value(input)).ok).toBe(false);
  expect(decodeAnswer(field('date'), value('2026-10-28')).ok).toBe(true);
});
it('uses stable choice IDs and canonical definition order', () => {
  const options = [
    { id: crypto.randomUUID(), label: 'Same' },
    { id: crypto.randomUUID(), label: 'Same' },
  ];
  const single = field('single-choice', { options });
  expect(decodeAnswer(single, value(options[0].id.toUpperCase()))).toEqual({
    ok: true,
    answer: value(options[0].id),
  });
  for (const input of ['Same', crypto.randomUUID(), [], false])
    expect(decodeAnswer(single, value(input)).ok).toBe(false);
  const multiple = field('multiple-choice', {
    options,
    minSelections: 1,
    maxSelections: 2,
  });
  expect(decodeAnswer(multiple, value([options[1].id, options[0].id]))).toEqual(
    { ok: true, answer: value(options.map((item) => item.id)) },
  );
  expect(decodeAnswer(multiple, value([]))).toEqual({
    ok: true,
    answer: { state: 'blank' },
  });
  for (const input of [
    [options[0].id, options[0].id],
    [crypto.randomUUID()],
    options[0].id,
    [1],
  ])
    expect(decodeAnswer(multiple, value(input)).ok).toBe(false);
  expect(
    decodeAnswer(
      field('multiple-choice', { options, minSelections: 2, maxSelections: 2 }),
      value([options[0].id]),
    ).ok,
  ).toBe(false);
  expect(
    decodeAnswer(
      field('multiple-choice', { options, minSelections: 0, maxSelections: 1 }),
      value(options.map((item) => item.id)),
    ).ok,
  ).toBe(false);
});
it('accepts only bounded file references, without claiming ownership or scan success', () => {
  const files = field('file', { maxFiles: 1 });
  const reference = crypto.randomUUID();
  expect(decodeAnswer(files, value([reference.toUpperCase()]))).toEqual({
    ok: true,
    answer: value([reference]),
  });
  expect(decodeAnswer(files, value([]))).toEqual({
    ok: true,
    answer: { state: 'blank' },
  });
  for (const input of [
    'https://example.com/file.pdf',
    ['not-a-uuid'],
    [reference, reference],
    [reference, crypto.randomUUID()],
  ])
    expect(decodeAnswer(files, value(input)).ok).toBe(false);
});
it('requires actual acknowledgment and never lets refusal satisfy requiredness', () => {
  const optional = field('acknowledgment');
  const required = { ...optional, required: true };
  expect(requiredAnswerIssue(optional, { state: 'missing' })).toBeUndefined();
  expect(
    requiredAnswerIssue(required, { state: 'value', value: true }),
  ).toBeUndefined();
  for (const answer of [
    { state: 'missing' },
    { state: 'refused' },
    { state: 'blank' },
    value(false),
  ]) {
    const decoded = decodeAnswer(required, answer);
    expect(
      decoded.ok && requiredAnswerIssue(required, decoded.answer),
    ).toBeTruthy();
  }
  expect(decodeAnswer(required, value('true')).ok).toBe(false);
  expect(
    requiredAnswerIssue(
      { ...shortText(), required: true },
      { state: 'value', value: 'yes' },
    ),
  ).toBeUndefined();
  expect(
    requiredAnswerIssue(required, { state: 'not-applicable' }),
  ).toBeUndefined();
});
