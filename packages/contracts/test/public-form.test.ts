import { expect, it } from 'vitest';
import { publicFormEnvelopeSchema } from '../src/public-form.ts';
import { formFixture } from './form-fixture.ts';
it('bounds the public form contract and rejects private metadata or another contract version', () => {
  const form = {
    publicId: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    definition: formFixture().definition,
  };
  expect(publicFormEnvelopeSchema.parse({ form }).form).toEqual(form);
  expect(
    publicFormEnvelopeSchema.safeParse({
      form: { ...form, workspaceId: crypto.randomUUID() },
    }).success,
  ).toBe(false);
  expect(
    publicFormEnvelopeSchema.safeParse({
      form: { ...form, definition: { ...form.definition, contractVersion: 2 } },
    }).success,
  ).toBe(false);
});
