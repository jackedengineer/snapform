import { expect, it } from 'vitest';
import {
  clipSummaryText,
  decodeResponseCursor,
  encodeResponseCursor,
  looksLikePersonName,
  responsePageSchema,
  summarizeResponse,
} from './responses.ts';
import { formFixture } from '../test/form-fixture.ts';
it('preserves database microseconds and identity in opaque response cursors', () => {
  const cursor = {
    createdAt: '2026-10-29T08:10:00.123456Z',
    id: crypto.randomUUID(),
  };
  const encoded = encodeResponseCursor(cursor);
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeResponseCursor(encoded ?? undefined)).toEqual(cursor);
  expect(decodeResponseCursor()).toBeUndefined();
  expect(encodeResponseCursor(null)).toBeNull();
});
it('rejects malformed, oversized and capability-bearing cursors', () => {
  for (const token of [
    '',
    'bad-json',
    'x'.repeat(513),
    btoa(
      JSON.stringify({
        createdAt: '2026-10-29T00:00:00Z',
        id: crypto.randomUUID(),
        capability: 'forged',
      }),
    ),
  ])
    expect(() => decodeResponseCursor(token)).toThrow();
});
function summaryFixture() {
  const { definition, ids } = formFixture();
  const common = { description: '', required: false, aiEnabled: false };
  const text = (id: string, label: string) => ({
    ...common,
    id,
    type: 'short-text' as const,
    label,
    minLength: 0,
    maxLength: 500,
  });
  const company = crypto.randomUUID(),
    name = crypto.randomUUID(),
    later = crypto.randomUUID(),
    notes = crypto.randomUUID();
  definition.pages[0].blocks.unshift(
    text(company, 'Company name'),
    text(name, 'What is your name?'),
  );
  definition.pages[1].blocks.push(text(later, 'Full name'), {
    ...common,
    id: notes,
    type: 'long-text',
    label: 'Anything else?',
    minLength: 0,
    maxLength: 10000,
  });
  return { definition, ids: { ...ids, company, name, later, notes } };
}
it('labels a response by the first answered person-name question in definition order', () => {
  const { definition, ids } = summaryFixture();
  expect(
    summarizeResponse(definition, {
      [ids.company]: 'Acme Studio',
      [ids.later]: 'Second Name',
      [ids.name]: '  Asha\n  Rao ',
      [ids.contact]: 'asha@example.invalid',
      [ids.notes]: 'Later notes',
      [ids.detail]: 'We need a\n\nnew site.',
    }),
  ).toEqual({ respondent: 'Asha Rao', preview: 'We need a new site.' });
  expect(
    summarizeResponse(definition, { [ids.name]: ' ', [ids.later]: 'Lee' })
      .respondent,
  ).toBe('Lee');
});
it('falls back to the first email, then to no label, and ignores other fields', () => {
  const { definition, ids } = summaryFixture();
  expect(
    summarizeResponse(definition, {
      [ids.company]: 'Acme Studio',
      [ids.contact]: 'lead@example.invalid',
      [ids.notes]: 'Only the later long answer',
    }),
  ).toEqual({
    respondent: 'lead@example.invalid',
    preview: 'Only the later long answer',
  });
  expect(
    summarizeResponse(definition, { [ids.kind]: ids.agency, unknown: 'x' }),
  ).toEqual({ respondent: null, preview: null });
  for (const label of [
    'Name',
    'Your full name',
    'First name',
    'Contact name',
    'NAME:',
  ])
    expect(looksLikePersonName(label)).toBe(true);
  for (const label of [
    'Company name',
    'Business Name',
    'Project name',
    'Username',
    'Organisation name',
    'Rename this',
    'Email',
  ])
    expect(looksLikePersonName(label)).toBe(false);
});
it('bounds summary text to one line without splitting characters', () => {
  const { definition, ids } = summaryFixture();
  const preview = summarizeResponse(definition, {
    [ids.detail]: `${'a'.repeat(118)}😀 trailing words`,
  }).preview;
  expect(preview).toBe(`${'a'.repeat(118)}…`);
  expect(preview?.isWellFormed()).toBe(true);
  expect(clipSummaryText('b'.repeat(120))).toBe('b'.repeat(120));
  expect(clipSummaryText('c'.repeat(200))).toHaveLength(120);
  expect(clipSummaryText('\n\t ')).toBeNull();
});
it('accepts bounded summaries and published versions in response pages', () => {
  const row = {
    id: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    version: 2,
    submittedAt: '2026-11-13T12:00:00Z',
    respondent: 'Asha Rao',
    preview: null,
  };
  const page = {
    title: 'Project enquiry',
    responses: [row],
    versions: [{ id: row.versionId, number: 2 }],
    role: 'owner',
    nextCursor: null,
  };
  expect(responsePageSchema.parse(page)).toEqual(page);
  // Servers since migration 0045 mark responses awaiting deletion.
  const marked = {
    ...page,
    responses: [{ ...row, deletionPending: true }],
  };
  expect(responsePageSchema.parse(marked)).toEqual(marked);
  for (const forged of [
    { ...page, responses: [{ ...row, deletionPending: 'yes' }] },
    { ...page, responses: [{ ...row, preview: 'x'.repeat(121) }] },
    { ...page, responses: [{ ...row, respondent: '' }] },
    { ...page, responses: [{ ...row, answers: {} }] },
    { ...page, versions: [{ id: row.versionId, number: 0 }] },
    { ...page, title: 'x'.repeat(121) },
  ])
    expect(() => responsePageSchema.parse(forged)).toThrow();
});
