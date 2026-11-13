import { expect, it } from 'vitest';
import { evaluateForm } from '@snapform/contracts/evaluate';
import { formFixture } from '../../../../../packages/contracts/test/form-fixture.ts';
import { readCollectorSearch, resolvePosition } from './navigation';
import { collectionSteps } from './steps';
const { definition, ids } = formFixture();
function setup(answers: Record<string, unknown>) {
  const evaluation = evaluateForm(definition, answers);
  if (!evaluation.ok) throw new Error('Invalid fixture');
  return {
    evaluation,
    steps: collectionSteps(definition, evaluation),
  };
}
it('keeps only a bounded step position and edit flag from the address', () => {
  expect(readCollectorSearch({ step: 2, edit: true })).toEqual({
    step: 2,
    edit: true,
  });
  expect(readCollectorSearch({ step: 'review' })).toEqual({ step: 'review' });
  for (const step of [0, -1, 1.5, 1001, '2', '<script>', null, [2]])
    expect(readCollectorSearch({ step, edit: 'yes' })).toEqual({});
  expect(
    readCollectorSearch({ step: 1, capability: 'secret', answers: 'raw' }),
  ).toEqual({ step: 1 });
});
it('never places the respondent past an unfinished step', () => {
  const blank = setup({});
  expect(
    resolvePosition(blank.steps, blank.evaluation, {}, { step: 2 }),
  ).toEqual({ index: 0, review: false });
  expect(
    resolvePosition(blank.steps, blank.evaluation, {}, { step: 'review' }),
  ).toEqual({ index: 0, review: false });
  expect(
    resolvePosition(
      blank.steps,
      blank.evaluation,
      {},
      { step: 'review' },
      true,
    ),
  ).toEqual({ index: 1, review: true });
});
it('follows the address and resumes at the first unfinished step', () => {
  const first = { [ids.budget]: { state: 'value', value: '5000' } };
  const partial = setup(first);
  expect(
    resolvePosition(partial.steps, partial.evaluation, first, { step: 2 }),
  ).toEqual({ index: 1, review: false });
  expect(
    resolvePosition(partial.steps, partial.evaluation, first, { step: 1 }),
  ).toEqual({ index: 0, review: false });
  expect(resolvePosition(partial.steps, partial.evaluation, first, {})).toEqual(
    { index: 1, review: false },
  );
  const done = {
    ...first,
    [ids.contact]: { state: 'value', value: 'client@example.com' },
  };
  const complete = setup(done);
  expect(
    resolvePosition(complete.steps, complete.evaluation, done, {}),
  ).toEqual({ index: 1, review: true });
  expect(
    resolvePosition(complete.steps, complete.evaluation, done, { step: 9 }),
  ).toEqual({ index: 1, review: false });
});
