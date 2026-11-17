import { describe, expect, it } from 'vitest';
import type { Field, FormDefinition } from '@snapform/contracts/form';
import type { Condition } from '@snapform/contracts/rules';
import { compileDefinition } from '@snapform/contracts/compile';
import { evaluateForm } from '@snapform/contracts/evaluate';
import { newStarterDefinition, starters } from './starters';

type Predicate = Extract<Condition, { fieldId: string }>;
const fields = (form: FormDefinition) =>
  form.pages.flatMap((page) =>
    page.blocks.filter((block): block is Field => 'required' in block),
  );
const predicates = (condition: Condition): Predicate[] =>
  condition.op === 'and' || condition.op === 'or'
    ? condition.conditions.flatMap(predicates)
    : condition.op === 'not'
      ? predicates(condition.condition)
      : [condition];
const routed = (form: FormDefinition) =>
  new Set(
    form.rules.flatMap((rule) =>
      predicates(rule.condition).map((predicate) =>
        'value' in predicate ? predicate.value : undefined,
      ),
    ),
  );
const field = (form: FormDefinition, label: string) => {
  const match = fields(form).find((item) => item.label === label);
  if (!match) throw new Error(`Missing question: ${label}`);
  return match;
};
const option = (form: FormDefinition, label: string, choice: string) => {
  const question = field(form, label);
  const match =
    question.type === 'single-choice' &&
    question.options.find((item) => item.label === choice);
  if (!match) throw new Error(`Missing option: ${label} / ${choice}`);
  return match.id;
};
// Valid synthetic answers that avoid every routed option unless one is picked.
function answers(form: FormDefinition, picks: Record<string, string> = {}) {
  const avoid = routed(form);
  return Object.fromEntries(
    fields(form).map((item) => {
      let value: string = 'Synthetic answer';
      if (item.type === 'email') value = 'synthetic@example.com';
      if (item.type === 'single-choice')
        value =
          item.id in picks
            ? picks[item.id]
            : item.options.find((choice) => !avoid.has(choice.id))!.id;
      return [item.id, { state: 'value', value }];
    }),
  );
}
const endingFor = (form: FormDefinition, picks: Record<string, string>) => {
  const result = evaluateForm(form, answers(form, picks));
  if (!result.ok || !result.complete)
    throw new Error('Starter answers did not evaluate as complete');
  return form.endings.find((ending) => ending.id === result.endingId)?.title;
};

describe('editable starter forms', () => {
  it('keeps the audience identities and order stable', () => {
    expect(starters.map((starter) => starter.id)).toEqual([
      'agency',
      'coach',
      'consultant',
      'startup',
    ]);
  });

  for (const starter of starters)
    describe(starter.title, () => {
      const form = newStarterDefinition(starter.id);
      it('compiles with the real contract and asks for a reachable contact', () => {
        expect(compileDefinition(form)).toMatchObject({ ok: true });
        const email = fields(form).find((item) => item.type === 'email');
        expect(email?.required).toBe(true);
        expect(fields(form).length).toBeGreaterThanOrEqual(6);
      });
      it('routes to one of at least two endings with valid references', () => {
        expect(form.rules.length).toBeGreaterThanOrEqual(1);
        expect(form.endings.length).toBeGreaterThanOrEqual(2);
        const endings = new Set(form.endings.map((ending) => ending.id));
        const pages = new Set(form.pages.map((page) => page.id));
        expect(endings.has(form.defaultEndingId)).toBe(true);
        for (const rule of form.rules) {
          expect(rule.action.type).toBe('end');
          if (rule.action.type !== 'end') continue;
          expect(pages.has(rule.action.fromPageId)).toBe(true);
          expect(endings.has(rule.action.endingId)).toBe(true);
          expect(rule.action.endingId).not.toBe(form.defaultEndingId);
          for (const predicate of predicates(rule.condition)) {
            const source = fields(form).find(
              (item) => item.id === predicate.fieldId,
            );
            expect(source?.type).toBe('single-choice');
            expect(predicate.op).toBe('eq');
            expect(
              source?.type === 'single-choice' &&
                source.options.some(
                  (choice) =>
                    'value' in predicate && choice.id === predicate.value,
                ),
            ).toBe(true);
          }
        }
      });
      it('reaches the default ending and every routed ending through the rule engine', () => {
        const fallback = form.endings.find(
          (ending) => ending.id === form.defaultEndingId,
        )?.title;
        expect(endingFor(form, {})).toBe(fallback);
        for (const rule of form.rules)
          for (const predicate of predicates(rule.condition)) {
            if (!('value' in predicate) || typeof predicate.value !== 'string')
              continue;
            const routedTitle = form.endings.find(
              (ending) =>
                rule.action.type === 'end' &&
                ending.id === rule.action.endingId,
            )?.title;
            expect(
              endingFor(form, { [predicate.fieldId]: predicate.value }),
            ).toBe(routedTitle);
          }
      });
      it('keeps labels short and copy free of em dashes', () => {
        for (const item of fields(form))
          expect(item.label.length).toBeLessThanOrEqual(48);
        expect(JSON.stringify(form)).not.toContain('—');
      });
    });

  it('qualifies agency enquiries by service, budget, start and decision role', () => {
    const form = newStarterDefinition('agency');
    expect(
      fields(form).map((item) => [item.type, item.label, item.required]),
    ).toEqual([
      ['single-choice', 'What do you need help with?', true],
      ['single-choice', 'What’s your budget?', true],
      ['single-choice', 'When would you like to start?', true],
      ['single-choice', 'What’s your role in the decision?', true],
      ['long-text', 'What problem are you trying to solve?', true],
      ['short-text', 'Your name', true],
      ['email', 'Work email', true],
      ['short-text', 'Company', true],
      ['short-text', 'Website', false],
    ]);
    const service = field(form, 'What do you need help with?');
    expect(
      service.type === 'single-choice' &&
        service.options.map((item) => item.label),
    ).toEqual([
      'A new website',
      'A website redesign',
      'Brand identity',
      'Ongoing support',
      'Something else',
    ]);
    const role = field(form, 'What’s your role in the decision?');
    expect(
      role.type === 'single-choice' && role.options.map((item) => item.label),
    ).toEqual(['I decide', 'I recommend', 'I’m gathering options']);
    const budget = field(form, 'What’s your budget?');
    const pick = (choice: string) => ({
      [budget.id]: option(form, 'What’s your budget?', choice),
    });
    expect(endingFor(form, pick('Under USD 5,000'))).toBe(
      'Thanks, we may not be the right fit',
    );
    for (const choice of ['USD 5,000 to 15,000', 'Not sure yet'])
      expect(endingFor(form, pick(choice))).toBe(
        'Thanks, here’s what happens next',
      );
    expect(
      form.endings.find((ending) => ending.id === form.defaultEndingId)
        ?.description,
    ).toContain('within one working day');
  });

  it('holds consultant discovery until budget and timing are real', () => {
    const form = newStarterDefinition('consultant');
    const budget = field(form, 'What budget is set aside?');
    const timeline = field(form, 'When do you need results?');
    const notYet = 'Thanks, it may be a little early';
    expect(
      endingFor(form, {
        [budget.id]: option(form, budget.label, 'No budget set yet'),
      }),
    ).toBe(notYet);
    expect(
      endingFor(form, {
        [timeline.id]: option(form, timeline.label, 'Just exploring'),
      }),
    ).toBe(notYet);
    expect(
      endingFor(form, {
        [budget.id]: option(form, budget.label, 'USD 5,000 to 20,000'),
        [timeline.id]: option(form, timeline.label, 'In 1 to 3 months'),
      }),
    ).toBe('Thanks, let’s find a time to talk');
  });

  it('gives coaching applicants who are still exploring a gentle ending', () => {
    const form = newStarterDefinition('coach');
    const commitment = field(form, 'How ready are you to commit?');
    const pick = (choice: string) => ({
      [commitment.id]: option(form, commitment.label, choice),
    });
    expect(endingFor(form, pick('Just exploring for now'))).toBe(
      'Thanks, there’s no rush',
    );
    expect(endingFor(form, pick('Ready to start now'))).toBe(
      'Thanks for applying',
    );
  });

  it('routes small teams asking for a demo to self-serve', () => {
    const form = newStarterDefinition('startup');
    const size = field(form, 'How many people would use it?');
    const pick = (choice: string) => ({
      [size.id]: option(form, size.label, choice),
    });
    for (const choice of ['Just me', '2 to 10'])
      expect(endingFor(form, pick(choice))).toBe('Thanks, you can start today');
    for (const choice of ['11 to 50', 'More than 200'])
      expect(endingFor(form, pick(choice))).toBe(
        'Thanks, we’ll be in touch about your demo',
      );
  });

  it('makes independent identities and editable copies on every creation', () => {
    const first = newStarterDefinition('agency');
    const second = newStarterDefinition('agency');
    const ids = (form: typeof first) => [
      ...form.pages.flatMap((page) => [
        page.id,
        ...page.blocks.flatMap((block) => [
          block.id,
          ...('options' in block
            ? block.options.map((choice) => choice.id)
            : []),
        ]),
      ]),
      ...form.endings.map((ending) => ending.id),
      ...form.rules.map((rule) => rule.id),
    ];
    expect(ids(first).some((id) => ids(second).includes(id))).toBe(false);
    first.pages[0].blocks.length = 0;
    expect(second.pages[0].blocks.length).toBeGreaterThan(0);
  });
});

it('opens every starter one question at a time', () => {
  for (const starter of starters)
    expect(newStarterDefinition(starter.id).presentation).toBe('card');
});
