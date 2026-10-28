import { describe, expect, it } from 'vitest';
import { blockSchema, formDefinitionSchema } from './form.ts';

const id = () => crypto.randomUUID();
const base = () => ({
  id: id(),
  label: 'Your answer',
  description: '',
  required: false,
  aiEnabled: false,
});
const text = () => ({
  ...base(),
  type: 'short-text',
  minLength: 0,
  maxLength: 500,
});
const option = (label: string) => ({ id: id(), label });
const endingId = id();
const definition = () => ({
  contractVersion: 1,
  title: 'Project enquiry',
  description: '',
  presentation: 'page',
  rules: [],
  endings: [{ id: endingId, title: 'Thank you', description: '' }],
  defaultEndingId: endingId,
  pages: [{ id: id(), title: 'About you', blocks: [text()] }],
});

describe('bounded form definitions', () => {
  it('preserves incomplete labels and titles in a structurally safe draft', () => {
    expect(blockSchema.safeParse({ ...text(), label: '' }).success).toBe(true);
    expect(
      formDefinitionSchema.safeParse({ ...definition(), title: '' }).success,
    ).toBe(true);
  });
  it('accepts all nine answer types and content without executable markup', () => {
    const blocks = [
      text(),
      { ...base(), type: 'long-text', minLength: 0, maxLength: 10000 },
      { ...base(), type: 'email' },
      {
        ...base(),
        type: 'number',
        unit: { kind: 'currency', code: 'INR' },
        min: 0,
        max: 100000,
      },
      {
        ...base(),
        type: 'single-choice',
        options: [option('Yes'), option('No')],
      },
      {
        ...base(),
        type: 'multiple-choice',
        options: [option('Design'), option('Development')],
        minSelections: 0,
        maxSelections: 2,
      },
      { ...base(), type: 'date', min: '2024-02-29', max: '2028-02-29' },
      { ...base(), type: 'acknowledgment' },
      { ...base(), type: 'file', maxFiles: 3 },
      { id: id(), type: 'heading', text: 'A little context' },
      { id: id(), type: 'help', text: '<script>literal text</script>' },
    ];
    for (const block of blocks)
      expect(blockSchema.safeParse(block).success).toBe(true);
    expect(formDefinitionSchema.parse(definition()).contractVersion).toBe(1);
  });
  it('rejects invalid scalar constraints and unknown properties', () => {
    for (const block of [
      { ...text(), maxLength: 501 },
      { ...text(), regex: '.*' },
      { ...text(), label: 'A\0B' },
      { ...text(), label: '\ud800' },
      { ...base(), type: 'email', required: 'yes' },
      { ...base(), type: 'number', unit: { kind: 'none' }, max: Infinity },
      { ...base(), type: 'number', unit: { kind: 'currency', code: 'rupees' } },
      { ...base(), type: 'date', min: '2025-02-29' },
      { ...base(), type: 'file', maxFiles: 4 },
      { ...base(), type: 'file', maxFiles: 1, aiEnabled: true },
      { ...base(), type: 'number', unit: { kind: 'currency', code: 'ZZZ' } },
      { ...base(), type: 'javascript' },
    ])
      expect(blockSchema.safeParse(block).success).toBe(false);
  });
  it('bounds choices and keeps IDs independent from editable labels', () => {
    const options = [option('Same'), option('Same')];
    expect(
      blockSchema.safeParse({ ...base(), type: 'single-choice', options })
        .success,
    ).toBe(true);
    for (const block of [
      {
        ...base(),
        type: 'single-choice',
        options: Array.from({ length: 21 }, () => option('x')),
      },
      { ...base(), type: 'single-choice', options: [options[0], options[0]] },
    ])
      expect(blockSchema.safeParse(block).success).toBe(false);
  });
  it('allows an empty draft but limits pages, fields and shared identities', () => {
    const valid = definition();
    expect(
      formDefinitionSchema.safeParse({
        ...valid,
        pages: [{ ...valid.pages[0], blocks: [] }],
      }).success,
    ).toBe(true);
    for (const value of [
      { ...valid, contractVersion: 2 },
      { ...valid, pages: [] },
      {
        ...valid,
        pages: Array.from({ length: 11 }, () => ({
          id: id(),
          title: 'Page',
          blocks: [],
        })),
      },
      {
        ...valid,
        pages: [
          { id: id(), title: 'Page', blocks: Array.from({ length: 51 }, text) },
        ],
      },
      { ...valid, pages: [valid.pages[0], valid.pages[0]] },
      {
        ...valid,
        pages: [
          {
            ...valid.pages[0],
            blocks: [valid.pages[0].blocks[0], valid.pages[0].blocks[0]],
          },
        ],
      },
      { ...valid, ownerId: 'forged' },
    ])
      expect(formDefinitionSchema.safeParse(value).success).toBe(false);
  });
  it('bounds actual UTF-8 JSON bytes, including multibyte content', () => {
    const valid = definition();
    const blocks = Array.from({ length: 30 }, () => ({
      id: id(),
      type: 'help',
      text: '🙂'.repeat(3000),
    }));
    expect(
      formDefinitionSchema.safeParse({
        ...valid,
        pages: [{ id: id(), title: 'Page', blocks }],
      }).success,
    ).toBe(false);
  });
  it('rejects an option identity reused in another field or page', () => {
    const valid = definition();
    const shared = option('Choice');
    const blocks = [0, 1].map(() => ({
      ...base(),
      type: 'single-choice',
      options: [shared],
    }));
    expect(
      formDefinitionSchema.safeParse({
        ...valid,
        pages: [{ id: id(), title: 'Page', blocks }],
      }).success,
    ).toBe(false);
  });
  it('bounds non-answer content independently of the answer-field limit', () => {
    const value = definition();
    const blocks = Array.from({ length: 101 }, () => ({
      id: id(),
      type: 'heading',
      text: 'Context',
    }));
    expect(
      formDefinitionSchema.safeParse({
        ...value,
        pages: [{ id: id(), title: 'Page', blocks }],
      }).success,
    ).toBe(false);
  });
});
