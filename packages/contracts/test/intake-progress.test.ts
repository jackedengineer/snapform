import { expect, it } from 'vitest';
import {
  prepareIntakeProgress,
  intakeMutationSchema,
} from '../src/intake-progress.ts';
import { formFixture } from './form-fixture.ts';
it('saves bounded partial inputs without pretending an incomplete response was submitted', () => {
  const { definition, ids } = formFixture();
  const answers = { [ids.budget]: { state: 'value', value: '-' } };
  expect(prepareIntakeProgress(definition, answers, false)).toEqual({
    ok: true,
    answers,
    endingId: definition.defaultEndingId,
  });
  const submission = prepareIntakeProgress(definition, answers, true);
  expect(submission.ok).toBe(false);
  if (!submission.ok)
    expect(
      submission.issues.some((issue) => issue.targetId === ids.budget),
    ).toBe(true);
});
it('computes applicability and canonical values on submit and retains zero', () => {
  const { definition, ids } = formFixture();
  definition.rules = [
    {
      id: crypto.randomUUID(),
      priority: 0,
      condition: { op: 'eq', fieldId: ids.kind, value: ids.startup },
      action: { type: 'show', fieldId: ids.budget },
    },
  ];
  const result = prepareIntakeProgress(
    definition,
    {
      [ids.kind]: { state: 'value', value: ids.agency },
      [ids.budget]: { state: 'value', value: 900 },
      [ids.contact]: { state: 'value', value: 'qa@EXAMPLE.INVALID' },
    },
    true,
  );
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.answers[ids.budget]).toEqual({ state: 'not-applicable' });
    expect(result.answers[ids.contact]).toEqual({
      state: 'value',
      value: 'qa@example.invalid',
    });
  }
  definition.rules = [];
  const zero = prepareIntakeProgress(
    definition,
    {
      [ids.budget]: { state: 'value', value: '0' },
      [ids.contact]: { state: 'value', value: 'qa@example.invalid' },
    },
    true,
  );
  expect(zero.ok && zero.answers[ids.budget]).toEqual({
    state: 'value',
    value: 0,
  });
});
it('rejects forged applicability, unrelated identities, unknown operation keys and unbounded inputs', () => {
  const { definition, ids } = formFixture();
  for (const answers of [
    { [ids.budget]: { state: 'not-applicable' } },
    { [crypto.randomUUID()]: { state: 'value', value: 'foreign' } },
    { [ids.detail]: { state: 'value', value: 'x'.repeat(10001) } },
  ])
    expect(prepareIntakeProgress(definition, answers, false).ok).toBe(false);
  const request = {
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
    answers: {},
  };
  expect(intakeMutationSchema.safeParse(request).success).toBe(true);
  expect(
    intakeMutationSchema.safeParse({ ...request, status: 'submitted' }).success,
  ).toBe(false);
  expect(
    intakeMutationSchema.safeParse({ ...request, expectedRevision: 0 }).success,
  ).toBe(false);
});
