import { expect, it } from 'vitest';
import { compileDefinition } from './compile.ts';
import type { Rule } from './rules.ts';
import { formFixture } from '../test/form-fixture.ts';
import { blockSchema } from './form.ts';
const makeRule = (
  condition: Rule['condition'],
  action: Rule['action'],
  priority = 0,
): Rule => ({ id: crypto.randomUUID(), condition, action, priority });
const codes = (input: unknown) => {
  const result = compileDefinition(input);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};
it('compiles valid definitions and sorts explicit rule priorities', () => {
  const { definition, ids } = formFixture();
  definition.rules = [
    makeRule(
      { op: 'answered', fieldId: ids.contact },
      { type: 'end', fromPageId: ids.second, endingId: ids.ending },
      2,
    ),
    makeRule(
      { op: 'eq', fieldId: ids.kind, value: ids.agency },
      { type: 'show', fieldId: ids.budget },
      0,
    ),
    makeRule(
      { op: 'gte', fieldId: ids.budget, value: 0 },
      { type: 'go-to', fromPageId: ids.first, pageId: ids.second },
      1,
    ),
  ];
  const result = compileDefinition(definition);
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.definition.rules.map((rule) => rule.priority)).toEqual([
      0, 1, 2,
    ]);
});
it('rejects invalid definitions, empty forms and missing endings', () => {
  expect(codes({})).toContain('INVALID_DEFINITION');
  const { definition } = formFixture();
  definition.pages = definition.pages.map((page) => ({ ...page, blocks: [] }));
  expect(codes(definition)).toContain('EMPTY_FORM');
  definition.defaultEndingId = crypto.randomUUID();
  expect(codes(definition)).toContain('UNKNOWN_ENDING');
});
it('keeps content blocks outside the answer and dependency registry', () => {
  const { definition } = formFixture();
  definition.pages[0].blocks.unshift(
    { id: crypto.randomUUID(), type: 'heading', text: 'Project context' },
    { id: crypto.randomUUID(), type: 'help', text: 'Tell us what matters.' },
  );
  expect(codes(definition)).toEqual([]);
});
it('blocks missing fields, source/destination pages and ending references', () => {
  const { definition, ids } = formFixture();
  const missing = crypto.randomUUID();
  for (const action of [
    { type: 'show', fieldId: missing },
    { type: 'go-to', fromPageId: ids.first, pageId: missing },
    { type: 'end', fromPageId: missing, endingId: ids.ending },
    { type: 'end', fromPageId: ids.first, endingId: missing },
  ] satisfies Rule['action'][]) {
    definition.rules = [makeRule({ op: 'answered', fieldId: missing }, action)];
    expect(codes(definition)).toContain('UNKNOWN_FIELD');
    expect(codes(definition).length).toBeGreaterThan(1);
  }
});
it('rejects cyclic/forward applicability dependencies and backward navigation', () => {
  const { definition, ids } = formFixture();
  definition.rules = [
    makeRule(
      { op: 'answered', fieldId: ids.detail },
      { type: 'show', fieldId: ids.budget },
    ),
  ];
  expect(codes(definition)).toContain('FORWARD_DEPENDENCY');
  definition.rules = [
    makeRule(
      { op: 'answered', fieldId: ids.contact },
      { type: 'go-to', fromPageId: ids.first, pageId: ids.second },
    ),
  ];
  expect(codes(definition)).toContain('FORWARD_DEPENDENCY');
  definition.rules = [
    makeRule(
      { op: 'answered', fieldId: ids.contact },
      { type: 'go-to', fromPageId: ids.second, pageId: ids.first },
    ),
  ];
  expect(codes(definition)).toContain('BACKWARD_NAVIGATION');
});
it('rejects ambiguous priorities and competing applicability rules', () => {
  const { definition, ids } = formFixture();
  const first = makeRule(
    { op: 'answered', fieldId: ids.kind },
    { type: 'show', fieldId: ids.budget },
  );
  definition.rules = [first, { ...first, id: crypto.randomUUID() }];
  expect(codes(definition)).toContain('DUPLICATE_PRIORITY');
  expect(codes(definition)).toContain('DUPLICATE_APPLICABILITY');
});
it('validates predicate operators and operand types against their fields', () => {
  const { definition, ids } = formFixture();
  for (const condition of [
    { op: 'eq', fieldId: ids.budget, value: '1000' },
    { op: 'gt', fieldId: ids.detail, value: 'abc' },
    { op: 'eq', fieldId: ids.kind, value: 'Agency' },
    { op: 'contains', fieldId: ids.kind, optionId: ids.agency },
    { op: 'contains', fieldId: ids.budget, optionId: ids.agency },
  ] satisfies Rule['condition'][]) {
    definition.rules = [
      makeRule(condition, {
        type: 'end',
        fromPageId: ids.first,
        endingId: ids.ending,
      }),
    ];
    expect(codes(definition)).toContain('INVALID_COMPARISON');
  }
  definition.rules = [
    makeRule(
      {
        op: 'and',
        conditions: [
          { op: 'not', condition: { op: 'unanswered', fieldId: ids.kind } },
          {
            op: 'or',
            conditions: [{ op: 'neq', fieldId: ids.detail, value: 'x' }],
          },
        ],
      },
      { type: 'end', fromPageId: ids.first, endingId: ids.ending },
    ),
  ];
  expect(codes(definition)).toEqual([]);
});
it('checks date, acknowledgment, multi-choice and file predicates by type', () => {
  const { definition, ids } = formFixture();
  const common = {
    id: ids.kind,
    label: 'Question',
    description: '',
    required: false,
    aiEnabled: false,
  };
  const examples = [
    {
      block: { ...common, type: 'date' },
      op: 'gte',
      good: '2026-10-28',
      bad: '2025-02-29',
    },
    {
      block: { ...common, type: 'acknowledgment' },
      op: 'eq',
      good: false,
      bad: 'false',
    },
    {
      block: { ...common, type: 'short-text', minLength: 0, maxLength: 500 },
      op: 'eq',
      good: 'hello',
      bad: true,
    },
    {
      block: { ...common, type: 'file', maxFiles: 1 },
      op: 'eq',
      good: null,
      bad: 'file',
    },
  ];
  for (const example of examples) {
    definition.pages[0].blocks[0] = blockSchema.parse(example.block);
    for (const operand of [example.good, example.bad]) {
      if (operand === null) continue;
      definition.rules = [
        makeRule(
          { op: example.op as 'eq' | 'gte', fieldId: ids.kind, value: operand },
          { type: 'end', fromPageId: ids.first, endingId: ids.ending },
        ),
      ];
      expect(codes(definition).includes('INVALID_COMPARISON')).toBe(
        operand === example.bad,
      );
    }
  }
  definition.pages[0].blocks[0] = blockSchema.parse({
    ...common,
    type: 'multiple-choice',
    options: [{ id: ids.agency, label: 'Agency' }],
    minSelections: 0,
    maxSelections: 1,
  });
  for (const optionId of [ids.agency, crypto.randomUUID()]) {
    definition.rules = [
      makeRule(
        { op: 'contains', fieldId: ids.kind, optionId },
        { type: 'end', fromPageId: ids.first, endingId: ids.ending },
      ),
    ];
    expect(codes(definition).includes('INVALID_COMPARISON')).toBe(
      optionId !== ids.agency,
    );
  }
});
