import { expect, it } from 'vitest';
import type { Answer } from '@snapform/contracts/answers';
import { formFixture } from '../../../../../packages/contracts/test/form-fixture.ts';
import { briefOf } from './brief';

const value = (value: string | number): Answer => ({ state: 'value', value });

it('leads with the answers the routing rules qualify on, in form order', () => {
  const { definition, ids } = formFixture();
  const lighter = crypto.randomUUID();
  definition.endings.push({
    id: lighter,
    title: 'A lighter option',
    description: '',
  });
  definition.rules = [
    {
      id: crypto.randomUUID(),
      priority: 0,
      condition: { op: 'lt', fieldId: ids.budget, value: 50000 },
      action: { type: 'end', fromPageId: ids.first, endingId: lighter },
    },
    {
      id: crypto.randomUUID(),
      priority: 1,
      condition: {
        op: 'and',
        conditions: [
          { op: 'eq', fieldId: ids.kind, value: ids.agency },
          { op: 'answered', fieldId: ids.contact },
        ],
      },
      action: {
        type: 'end',
        fromPageId: ids.second,
        endingId: definition.defaultEndingId,
      },
    },
  ];
  const brief = briefOf(definition, {
    [ids.kind]: value(ids.agency),
    [ids.budget]: value(20000),
    [ids.detail]: value('Synthetic context'),
    [ids.contact]: value('client@example.com'),
  });
  expect(brief.fields.map((field) => field.id)).toEqual([
    ids.kind,
    ids.budget,
    ids.contact,
  ]);
  expect(brief.outcome).toBe('A lighter option');
});

it('skips qualifying questions that were not answered', () => {
  const { definition, ids } = formFixture();
  definition.rules = [
    {
      id: crypto.randomUUID(),
      priority: 0,
      condition: {
        op: 'not',
        condition: { op: 'eq', fieldId: ids.kind, value: ids.startup },
      },
      action: { type: 'show', fieldId: ids.budget },
    },
  ];
  const brief = briefOf(definition, {
    [ids.kind]: { state: 'refused' },
    [ids.budget]: value(1000),
  });
  expect(brief.fields).toEqual([]);
});

it('falls back to answered choices when no rule qualifies, and names no outcome for one ending', () => {
  const { definition, ids } = formFixture();
  const brief = briefOf(definition, {
    [ids.kind]: value(ids.startup),
    [ids.budget]: value(1000),
  });
  expect(brief.fields.map((field) => field.id)).toEqual([ids.kind]);
  expect(brief.outcome).toBeUndefined();
});

it('keeps the brief to four answers', () => {
  const { definition, ids } = formFixture();
  const extra = Array.from({ length: 5 }, (_, index) => ({
    id: crypto.randomUUID(),
    type: 'single-choice' as const,
    label: `Choice ${index}`,
    description: '',
    required: false,
    aiEnabled: false as const,
    options: [{ id: crypto.randomUUID(), label: 'Yes' }],
  }));
  definition.pages[0].blocks.push(...extra);
  const answers = Object.fromEntries(
    extra.map((block) => [block.id, value(block.options[0].id)]),
  );
  answers[ids.kind] = value(ids.agency);
  expect(briefOf(definition, answers).fields).toHaveLength(4);
});

it('fills the brief with answered choices, keeping qualifying answers when full', () => {
  const { definition, ids } = formFixture();
  definition.rules = [
    {
      id: crypto.randomUUID(),
      priority: 0,
      condition: { op: 'gte', fieldId: ids.budget, value: 1 },
      action: { type: 'show', fieldId: ids.detail },
    },
  ];
  const choices = Array.from({ length: 4 }, (_, index) => ({
    id: crypto.randomUUID(),
    type: 'single-choice' as const,
    label: `Choice ${index}`,
    description: '',
    required: false,
    aiEnabled: false as const,
    options: [{ id: crypto.randomUUID(), label: 'Yes' }],
  }));
  definition.pages[1].blocks.push(...choices);
  const answers = Object.fromEntries(
    choices.map((block) => [block.id, value(block.options[0].id)]),
  );
  answers[ids.kind] = value(ids.agency);
  answers[ids.budget] = value(1000);
  expect(briefOf(definition, answers).fields.map((field) => field.id)).toEqual([
    ids.kind,
    ids.budget,
    choices[0].id,
    choices[1].id,
  ]);
});
