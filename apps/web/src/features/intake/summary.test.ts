import { expect, it } from 'vitest';
import { evaluateForm } from '@snapform/contracts/evaluate';
import { formFixture } from '../../../../../packages/contracts/test/form-fixture.ts';
import { collectionSteps } from './steps';
import { reviewSections } from './summary';
const { definition, ids } = formFixture();
function summarize(answers: Record<string, unknown>) {
  const evaluation = evaluateForm(definition, answers);
  if (!evaluation.ok) throw new Error('Invalid fixture');
  return reviewSections(collectionSteps(definition, evaluation), evaluation);
}
const answers = {
  [ids.kind]: { state: 'value', value: ids.agency },
  [ids.budget]: { state: 'value', value: '5000' },
  [ids.detail]: { state: 'blank' },
  [ids.contact]: { state: 'value', value: 'client@example.com' },
};
it('lists each visible question with a readable answer and its step', () => {
  const sections = summarize(answers);
  expect(sections.map((section) => section.title)).toEqual([
    'Project',
    'Contact',
  ]);
  expect(sections.flatMap((section) => section.rows)).toEqual([
    { id: ids.kind, label: 'Business', answer: 'Agency', stepIndex: 0 },
    { id: ids.budget, label: 'Budget', answer: 'INR 5,000', stepIndex: 0 },
    { id: ids.detail, label: 'Context', answer: 'Not answered', stepIndex: 0 },
    {
      id: ids.contact,
      label: 'Email',
      answer: 'client@example.com',
      stepIndex: 1,
    },
  ]);
});
it('names skipped and declined answers and flags unfinished ones', () => {
  const rows = summarize({
    [ids.detail]: { state: 'refused' },
  }).flatMap((section) => section.rows);
  expect(rows.find((row) => row.id === ids.kind)?.answer).toBe('Not answered');
  expect(rows.find((row) => row.id === ids.detail)?.answer).toBe(
    'Prefer not to answer',
  );
  expect(rows.find((row) => row.id === ids.budget)).toMatchObject({
    answer: 'Not answered',
    issue: 'Complete this required field.',
  });
});
it('points card questions at their own step and omits hidden questions', () => {
  definition.presentation = 'card';
  definition.rules = [
    {
      id: crypto.randomUUID(),
      priority: 0,
      condition: { op: 'eq', fieldId: ids.kind, value: ids.startup },
      action: { type: 'show', fieldId: ids.budget },
    },
  ];
  try {
    const rows = summarize(answers).flatMap((section) => section.rows);
    expect(rows.map((row) => [row.label, row.stepIndex])).toEqual([
      ['Business', 0],
      ['Context', 1],
      ['Email', 2],
    ]);
  } finally {
    definition.presentation = 'page';
    definition.rules = [];
  }
});
it('shows uploaded file names on review, never their identities', () => {
  const withFile = structuredClone(definition);
  const question = crypto.randomUUID(),
    file = crypto.randomUUID();
  withFile.pages[0].blocks.push({
    id: question,
    type: 'file',
    label: 'Brief',
    description: '',
    required: false,
    aiEnabled: false,
    maxFiles: 1,
  });
  const evaluation = evaluateForm(withFile, {
    ...answers,
    [question]: { state: 'value', value: [file] },
  });
  if (!evaluation.ok) throw new Error('Invalid fixture');
  const steps = collectionSteps(withFile, evaluation);
  const row = (files?: { id: string; name: string }[]) =>
    reviewSections(steps, evaluation, files)
      .flatMap((section) => section.rows)
      .find((item) => item.id === question)?.answer;
  expect(row([{ id: file, name: 'Brief.pdf' }])).toBe('Brief.pdf');
  expect(row()).toBe('Unavailable file');
});
