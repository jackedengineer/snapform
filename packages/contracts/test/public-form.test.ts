import { expect, it } from 'vitest';
import {
  publicBusiness,
  publicFormEnvelopeSchema,
} from '../src/public-form.ts';
import { formFixture } from './form-fixture.ts';
const form = () => ({
  publicId: crypto.randomUUID(),
  versionId: crypto.randomUUID(),
  definition: formFixture().definition,
});
it('bounds the public form contract and rejects private metadata or another contract version', () => {
  const plain = form();
  expect(publicFormEnvelopeSchema.parse({ form: plain }).form).toEqual(plain);
  expect(
    publicFormEnvelopeSchema.safeParse({
      form: { ...plain, workspaceId: crypto.randomUUID() },
    }).success,
  ).toBe(false);
  expect(
    publicFormEnvelopeSchema.safeParse({
      form: {
        ...plain,
        definition: { ...plain.definition, contractVersion: 2 },
      },
    }).success,
  ).toBe(false);
});
it('names the business behind a form, and stays valid without one', () => {
  const named = { ...form(), business: { name: 'Studio North' } };
  expect(publicFormEnvelopeSchema.parse({ form: named }).form).toEqual(named);
  const older = form();
  expect(
    publicFormEnvelopeSchema.parse({ form: older }).form.business,
  ).toBeUndefined();
  for (const business of [
    { name: '' },
    { name: '   ' },
    { name: 'x'.repeat(81) },
    { name: 42 },
    {},
    null,
    'Studio North',
  ])
    expect(
      publicFormEnvelopeSchema.safeParse({ form: { ...older, business } })
        .success,
    ).toBe(false);
});
it('keeps room for later business details without breaking open forms', () => {
  const parsed = publicFormEnvelopeSchema.parse({
    form: {
      ...form(),
      business: { name: 'Studio North', logo: 'https://example.invalid/l' },
    },
  });
  expect(parsed.form.business).toEqual({ name: 'Studio North' });
});
it('carries the plan flags respondents need, and stays valid without them', () => {
  for (const plan of [
    { badge: true, embed: false },
    { badge: false, embed: true },
  ]) {
    const flagged = { ...form(), plan };
    expect(publicFormEnvelopeSchema.parse({ form: flagged }).form).toEqual(
      flagged,
    );
  }
  expect(
    publicFormEnvelopeSchema.parse({ form: form() }).form.plan,
  ).toBeUndefined();
  // Later flags (such as uploads) are dropped, not rejected.
  expect(
    publicFormEnvelopeSchema.parse({
      form: { ...form(), plan: { badge: true, embed: false, uploads: false } },
    }).form.plan,
  ).toEqual({ badge: true, embed: false });
  for (const plan of [
    { badge: true },
    { badge: 'false', embed: true },
    { badge: false, embed: null },
    null,
    'pro',
  ])
    expect(
      publicFormEnvelopeSchema.safeParse({ form: { ...form(), plan } }).success,
    ).toBe(false);
});
it('derives a trimmed, bounded business name from the workspace name', () => {
  expect(publicBusiness('  Studio North  ')).toEqual({ name: 'Studio North' });
  expect(publicBusiness('Ünïcødé Studio 🌿')).toEqual({
    name: 'Ünïcødé Studio 🌿',
  });
  expect(publicBusiness('x'.repeat(80))).toEqual({ name: 'x'.repeat(80) });
  for (const name of [null, undefined, '', '  ', 'x'.repeat(81), 'a\0b', 7])
    expect(publicBusiness(name)).toBeUndefined();
});
