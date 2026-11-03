import { describe, expect, it } from 'vitest';
import { compileDefinition } from '@snapform/contracts/compile';
import { newStarterDefinition, starters } from './starters';

describe('editable starter forms', () => {
  it('creates publishable starting points for each audience', () => {
    expect(starters.map((starter) => starter.id)).toEqual([
      'agency',
      'coach',
      'consultant',
      'startup',
    ]);
    for (const starter of starters) {
      const form = newStarterDefinition(starter.id);
      expect(compileDefinition(form).ok).toBe(true);
      expect(form.pages[0].blocks.length).toBeGreaterThanOrEqual(4);
      expect(form.pages[0].blocks.some((block) => block.type === 'email')).toBe(
        true,
      );
      expect(form.rules).toEqual([]);
    }
  });
  it('keeps contact information optional for product feedback', () => {
    const email = newStarterDefinition('startup').pages[0].blocks.find(
      (block) => block.type === 'email',
    );
    expect(email?.required).toBe(false);
  });
  it('makes independent identities and editable copies on every creation', () => {
    const first = newStarterDefinition('agency');
    const second = newStarterDefinition('agency');
    const ids = (form: typeof first) => [
      form.pages[0].id,
      ...form.pages[0].blocks.flatMap((block) => [
        block.id,
        ...('options' in block ? block.options.map((option) => option.id) : []),
      ]),
      ...form.endings.map((ending) => ending.id),
    ];
    expect(ids(first).some((id) => ids(second).includes(id))).toBe(false);
    first.pages[0].blocks.length = 0;
    expect(second.pages[0].blocks.length).toBeGreaterThan(0);
  });
});
