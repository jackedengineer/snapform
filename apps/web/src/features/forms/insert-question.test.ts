import { describe, expect, it } from 'vitest';
import { insertQuestion } from './insert-question';
import { newBlankDefinition, newBlock } from './new-form';

describe('adding a question where the author is working', () => {
  it('inserts after the selected question without changing existing identities', () => {
    const definition = newBlankDefinition();
    const first = newBlock('email'),
      last = newBlock('long-text');
    definition.pages[0].blocks = [first, last];
    const added = newBlock('short-text');
    const next = insertQuestion(
      definition,
      definition.pages[0].id,
      first.id,
      added,
    );
    expect(next?.pages[0].blocks).toEqual([first, added, last]);
    expect(definition.pages[0].blocks).toEqual([first, last]);
  });
  it('appends to the chosen page when nothing is selected', () => {
    const definition = newBlankDefinition();
    const added = newBlock('email');
    expect(
      insertQuestion(definition, definition.pages[0].id, null, added)?.pages[0]
        .blocks,
    ).toEqual([added]);
    expect(insertQuestion(definition, 'missing', null, added)).toBeNull();
  });
  it('enforces separate form-wide answer and content limits', () => {
    const definition = newBlankDefinition();
    definition.pages[0].blocks = Array.from({ length: 50 }, () =>
      newBlock('email'),
    );
    const page = definition.pages[0].id;
    expect(
      insertQuestion(definition, page, null, newBlock('email')),
    ).toBeNull();
    expect(
      insertQuestion(definition, page, null, newBlock('heading')),
    ).not.toBeNull();
    definition.pages[0].blocks = Array.from({ length: 100 }, () =>
      newBlock('heading'),
    );
    expect(insertQuestion(definition, page, null, newBlock('help'))).toBeNull();
    expect(
      insertQuestion(definition, page, null, newBlock('email')),
    ).not.toBeNull();
  });
});
