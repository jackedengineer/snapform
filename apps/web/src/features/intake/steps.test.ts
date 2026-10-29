import { expect, it } from 'vitest';
import { collectionSteps } from './steps';
import { evaluateForm } from '@snapform/contracts/evaluate';
import { formFixture } from '../../../../../packages/contracts/test/form-fixture.ts';
it('builds page/card steps only from effective pages and visible fields', () => {
  const { definition, ids } = formFixture();
  definition.rules = [
    {
      id: crypto.randomUUID(),
      priority: 0,
      condition: { op: 'eq', fieldId: ids.kind, value: ids.startup },
      action: { type: 'show', fieldId: ids.budget },
    },
  ];
  const result = evaluateForm(definition, {
    [ids.kind]: { state: 'value', value: ids.agency },
  });
  if (!result.ok) throw new Error('Invalid fixture');
  expect(collectionSteps(definition, result)).toHaveLength(2);
  definition.presentation = 'card';
  const cards = collectionSteps(definition, result);
  expect(cards).toHaveLength(3);
  expect(
    cards
      .flatMap((step) => step.blocks)
      .some((block) => block.id === ids.budget),
  ).toBe(false);
});
