import { expect, it } from 'vitest';
import {
  encodeCsvCell,
  createResponseCsv,
  responseExportFilename,
  EXPORT_FILENAME_PATTERN,
} from './response-csv.ts';
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
it('writes plain, de-duplicated question headers with readable UTC times and empty skipped cells', () => {
  const { definition, ids } = formFixture();
  const fields = definition.pages.flatMap((page) => page.blocks);
  const budget = fields.find((block) => block.id === ids.budget);
  const contact = fields.find((block) => block.id === ids.contact);
  if (!budget || !('label' in budget) || !contact || !('label' in contact))
    throw Error('Label fixtures required');
  budget.label = '=dangerous header';
  contact.label = 'Context';
  const csv = createResponseCsv(definition, [
    {
      submittedAt: '2026-11-13T17:35:20.106472Z',
      answers: {
        [ids.budget]: { state: 'value', value: 0 },
        [ids.detail]: { state: 'refused' },
        [ids.kind]: { state: 'value', value: ids.agency },
      },
    },
    {
      submittedAt: '2026-11-13T09:05:00Z',
      answers: {
        [ids.kind]: { state: 'not-applicable' },
        [ids.detail]: { state: 'blank' },
        [ids.contact]: { state: 'value', value: 'lead@example.invalid' },
      },
    },
  ]);
  expect(csv).toBe(
    '\uFEFF"Submitted (UTC)","Business","\'=dangerous header (INR)","Context","Context (2)"\r\n' +
      '"2026-11-13 17:35","Agency",0,"Prefer not to answer",""\r\n' +
      '"2026-11-13 09:05","","","","lead@example.invalid"\r\n',
  );
  expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  expect(csv).not.toMatch(/state|Not answered|Not applicable|Left blank/);
});
it('numbers repeated headers past labels that already use the suffix', () => {
  const { definition, ids } = formFixture();
  for (const block of definition.pages.flatMap((page) => page.blocks))
    if ('label' in block)
      block.label =
        block.id === ids.kind
          ? 'Name (2)'
          : block.id === ids.budget
            ? ''
            : 'Name';
  expect(createResponseCsv(definition, []).split('\r\n')[0]).toBe(
    '\uFEFF"Submitted (UTC)","Name (2)","Untitled question (INR)","Name","Name (3)"',
  );
});
it('rejects submission times that are not UTC instants', () => {
  const { definition } = formFixture();
  for (const submittedAt of ['2026-11-13 17:35', '2026-11-13T17:35:00+05:30'])
    expect(() =>
      createResponseCsv(definition, [{ submittedAt, answers: {} }]),
    ).toThrow('INVALID_EXPORT_VALUE');
});
it('names downloads from the form title, version and export date', () => {
  const day = new Date('2026-11-13T23:59:59Z');
  expect(responseExportFilename('UX review: Project enquiry', 1, day)).toBe(
    'ux-review-project-enquiry-2026-11-13.csv',
  );
  expect(responseExportFilename('Café — Ñandú brief', 3, day)).toBe(
    'cafe-nandu-brief-v3-2026-11-13.csv',
  );
  expect(responseExportFilename('"; filename=../x', 1, day)).toBe(
    'filename-x-2026-11-13.csv',
  );
  expect(responseExportFilename('परियोजना 🚀', 1, day)).toBe(
    'responses-2026-11-13.csv',
  );
  const long = responseExportFilename('a'.repeat(120), 2147483647, day);
  expect(long).toBe(`${'a'.repeat(60)}-v2147483647-2026-11-13.csv`);
  for (const name of [long, 'responses-2026-11-13.csv'])
    expect(EXPORT_FILENAME_PATTERN.test(name)).toBe(true);
  for (const name of ['../x.csv', 'a.csv"; x', '-a.csv', 'A.csv', 'a.txt'])
    expect(EXPORT_FILENAME_PATTERN.test(name)).toBe(false);
});
it('rejects excessive export rows and encoded output instead of silently truncating', () => {
  const { definition, ids } = formFixture();
  const row = {
    submittedAt: '2026-10-29T10:00:00Z',
    answers: {
      [ids.detail]: { state: 'value' as const, value: 'x'.repeat(10000) },
    },
  };
  expect(() =>
    createResponseCsv(
      definition,
      Array.from({ length: 1001 }, () => row),
    ),
  ).toThrow('EXPORT_TOO_LARGE');
  expect(() =>
    createResponseCsv(
      definition,
      Array.from({ length: 300 }, () => row),
    ),
  ).toThrow('EXPORT_TOO_LARGE');
});
