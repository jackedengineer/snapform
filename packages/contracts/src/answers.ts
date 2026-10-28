import { z } from 'zod';
import type { Field } from './form.ts';
import { isStorableText } from './text.ts';

const inputSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('missing') }),
  z.strictObject({ state: z.literal('blank') }),
  z.strictObject({ state: z.literal('refused') }),
  z.strictObject({
    state: z.literal('value'),
    value: z.union([
      z.string().max(10000).refine(isStorableText),
      z.number(),
      z.boolean(),
      z.array(z.string().max(100)).max(20),
    ]),
  }),
]);
export type Answer =
  | { state: 'missing' | 'blank' | 'refused' | 'not-applicable' }
  | { state: 'value'; value: string | number | boolean | string[] };
export type DecodedAnswer =
  { ok: true; answer: Answer } | { ok: false; error: string };
const valid = (value: string | number | boolean | string[]): DecodedAnswer => ({
  ok: true,
  answer: { state: 'value', value },
});
const blank = (): DecodedAnswer => ({ ok: true, answer: { state: 'blank' } });
const invalid = (error: string): DecodedAnswer => ({ ok: false, error });
const emailSchema = z.email().max(254);
const dateSchema = z.iso.date();
const uuidSchema = z.uuid();

// Inputs use explicit states. Applicability is computed by the engine, never by a respondent.
export function decodeAnswer(field: Field, raw: unknown): DecodedAnswer {
  const input = inputSchema.safeParse(
    raw === undefined ? { state: 'missing' } : raw,
  );
  if (!input.success) return invalid('Use a valid answer.');
  if (input.data.state !== 'value') return { ok: true, answer: input.data };
  const value = input.data.value;
  if (typeof value === 'string' && value.trim() === '') return blank();
  switch (field.type) {
    case 'short-text':
    case 'long-text': {
      if (typeof value !== 'string') return invalid('Enter text.');
      const text = value.replace(/\r\n?/g, '\n');
      if (text.length < field.minLength || text.length > field.maxLength)
        return invalid(`Use ${field.minLength}–${field.maxLength} characters.`);
      return valid(text);
    }
    case 'email': {
      if (
        typeof value !== 'string' ||
        !emailSchema.safeParse(value.trim()).success
      )
        return invalid('Enter a valid email address.');
      const email = value.trim();
      const separator = email.lastIndexOf('@');
      return valid(
        email.slice(0, separator + 1) +
          email.slice(separator + 1).toLowerCase(),
      );
    }
    case 'number': {
      if (
        typeof value !== 'number' &&
        (typeof value !== 'string' ||
          !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim()))
      )
        return invalid(
          'Enter a number without currency symbols or separators.',
        );
      const number = typeof value === 'number' ? value : Number(value.trim());
      if (
        !Number.isFinite(number) ||
        Math.abs(number) > Number.MAX_SAFE_INTEGER ||
        (field.min !== undefined && number < field.min) ||
        (field.max !== undefined && number > field.max)
      )
        return invalid('Enter a number within the allowed range.');
      return valid(number === 0 ? 0 : number);
    }
    case 'date':
      if (
        typeof value !== 'string' ||
        !dateSchema.safeParse(value).success ||
        (field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max)
      )
        return invalid('Enter a valid date within the allowed range.');
      return valid(value);
    case 'single-choice': {
      if (typeof value !== 'string')
        return invalid('Choose an available option.');
      const id = value.toLowerCase();
      return field.options.some((option) => option.id === id)
        ? valid(id)
        : invalid('Choose an available option.');
    }
    case 'multiple-choice': {
      if (!Array.isArray(value)) return invalid('Choose available options.');
      if (value.length === 0) return blank();
      const ids = value.map((id) => id.toLowerCase());
      const selected = new Set(ids);
      const ordered = field.options
        .filter((option) => selected.has(option.id))
        .map((option) => option.id);
      if (
        selected.size !== ids.length ||
        ordered.length !== ids.length ||
        ids.length < field.minSelections ||
        ids.length > field.maxSelections
      )
        return invalid('Choose the allowed number of available options.');
      return valid(ordered);
    }
    case 'acknowledgment':
      return typeof value === 'boolean'
        ? valid(value)
        : invalid('Choose whether to accept.');
    case 'file': {
      if (!Array.isArray(value)) return invalid('Upload a supported file.');
      if (value.length === 0) return blank();
      const ids = value.map((id) => id.toLowerCase());
      if (
        ids.length > field.maxFiles ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !uuidSchema.safeParse(id).success)
      )
        return invalid('Use valid file references within the file limit.');
      // The collection transaction must separately check ownership and scanner state.
      return valid(ids);
    }
  }
}
export function requiredAnswerIssue(
  field: Field,
  answer: Answer,
): string | undefined {
  if (!field.required || answer.state === 'not-applicable') return;
  if (answer.state !== 'value') return 'Complete this required field.';
  if (field.type === 'acknowledgment' && answer.value !== true)
    return 'Accept this acknowledgment to continue.';
}
