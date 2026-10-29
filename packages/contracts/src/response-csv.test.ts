import { expect, it } from 'vitest';
import { encodeCsvCell, createResponseCsv } from './response-csv.ts';
import { formFixture } from '../test/form-fixture.ts';
it('quotes separators, quotes and multiline text while keeping numeric zero and false typed', () => {
  expect(encodeCsvCell('A,"B"\nC')).toBe('"A,""B""\nC"');
  expect(encodeCsvCell(0)).toBe('0');
  expect(encodeCsvCell(-12.5)).toBe('-12.5');
  expect(encodeCsvCell(false)).toBe('FALSE');
  expect(() => encodeCsvCell(Infinity)).toThrow();
});
it('exports untrusted formula initiators and control-prefixed strings as text', () => {
  for (const value of [
    '=1+1',
    '+cmd',
    '-cmd',
    '@SUM(A1)',
    '  =1',
    '\t=1',
    '\n=1',
    '\r=1',
    '＝1',
    '＋1',
    '－1',
    '＠1',
    '";=1',
  ]) {
    const cell = encodeCsvCell(value);
    expect(cell.startsWith('"')).toBe(true);
    if (!value.startsWith('"')) expect(cell.startsWith('"\'')).toBe(true);
  }
});
it('uses immutable question identities and explicit state columns without including capabilities', () => {
  const { definition, ids } = formFixture();
  const budget = definition.pages[0].blocks.find(
    (block) => block.id === ids.budget,
  );
  if (!budget || !('label' in budget)) throw Error('Budget fixture required');
  budget.label = '=dangerous header';
  const csv = createResponseCsv(definition, 1, [
    {
      id: crypto.randomUUID(),
      submittedAt: '2026-10-29T10:00:00Z',
      answers: {
        [ids.budget]: { state: 'value', value: 0 },
        [ids.detail]: { state: 'refused' },
        [ids.kind]: { state: 'value', value: ids.agency },
      },
    },
  ]);
  expect(
    csv.startsWith('\uFEFF"Reference","Submitted at (UTC)","Version"'),
  ).toBe(true);
  expect(csv).toContain(`"'=dangerous header (INR) [${ids.budget}]"`);
  expect(csv).toContain(
    '"Agency","value",0,"value","Prefer not to answer","refused"',
  );
  expect(csv).not.toContain('capability');
  expect(csv.endsWith('\r\n')).toBe(true);
});
it('rejects excessive export rows and encoded output instead of silently truncating', () => {
  const { definition, ids } = formFixture();
  const row = {
    id: crypto.randomUUID(),
    submittedAt: '2026-10-29T10:00:00Z',
    answers: {
      [ids.detail]: { state: 'value' as const, value: 'x'.repeat(10000) },
    },
  };
  expect(() =>
    createResponseCsv(
      definition,
      1,
      Array.from({ length: 1001 }, () => row),
    ),
  ).toThrow('EXPORT_TOO_LARGE');
  expect(() =>
    createResponseCsv(
      definition,
      1,
      Array.from({ length: 300 }, () => row),
    ),
  ).toThrow('EXPORT_TOO_LARGE');
});
