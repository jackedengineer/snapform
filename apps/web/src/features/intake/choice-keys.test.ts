import { expect, it } from 'vitest';
import { evaluateForm } from '@snapform/contracts/evaluate';
import type { Block } from '@snapform/contracts/form';
import { formFixture } from '../../../../../packages/contracts/test/form-fixture.ts';
import { collectionSteps } from './steps';
import { choiceAdvances, optionIndexForKey } from './choice-keys';

it('maps a letter key to the option it labels, whatever its case', () => {
  expect(optionIndexForKey('a', 3)).toBe(0);
  expect(optionIndexForKey('C', 3)).toBe(2);
  expect(optionIndexForKey('d', 3)).toBe(-1);
  expect(optionIndexForKey('z', 26)).toBe(25);
});

it('ignores keys that are not a single letter', () => {
  for (const key of ['1', 'Enter', ' ', 'ArrowDown', 'ab', '', 'é'])
    expect(optionIndexForKey(key, 5)).toBe(-1);
});

const cardSteps = () => {
  const { definition } = formFixture();
  definition.presentation = 'card';
  const evaluation = evaluateForm(definition, {});
  if (!evaluation.ok) throw new Error('Invalid fixture');
  return collectionSteps(definition, evaluation);
};

it('moves on by itself only after the one single choice on a card', () => {
  const steps = cardSteps();
  const kinds = steps.map((step) =>
    choiceAdvances(step.blocks, 'card') ? 'advance' : 'stay',
  );
  const firstField = (blocks: Block[]) =>
    blocks.find((block) => 'required' in block)?.type;
  steps.forEach((step, index) =>
    expect(kinds[index]).toBe(
      firstField(step.blocks) === 'single-choice' ? 'advance' : 'stay',
    ),
  );
  expect(kinds).toContain('advance');
  expect(kinds).toContain('stay');
});

it('never moves on by itself on a page of several questions', () => {
  const steps = cardSteps();
  const choice = steps.find((step) => choiceAdvances(step.blocks, 'card'));
  if (!choice) throw new Error('Expected a single-choice card');
  expect(choiceAdvances(choice.blocks, 'page')).toBe(false);
  const other = steps.find((step) => !choiceAdvances(step.blocks, 'card'));
  if (!other) throw new Error('Expected another card');
  expect(choiceAdvances([...choice.blocks, ...other.blocks], 'card')).toBe(
    false,
  );
});
