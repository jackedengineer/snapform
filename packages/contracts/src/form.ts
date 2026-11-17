import { z } from './zod.ts';
import { isStorableText } from './text.ts';
import { ruleSchema } from './rules.ts';
import { supportedCurrencyCodes } from './currency.ts';

const identity = z.pipe(
  z.uuid(),
  z.transform((value: string) => value.toLowerCase()),
);
const currencies = new Set(supportedCurrencyCodes);
const plainText = (max: number) =>
  z
    .string()
    .check(
      z.maxLength(max),
      z.refine(isStorableText, 'Use valid text characters.'),
    );
const label = plainText(500);
const common = {
  id: identity,
  label,
  description: plainText(2000),
  required: z.boolean(),
  aiEnabled: z.boolean(),
};
const optionSchema = z.strictObject({ id: identity, label });
const options = z.array(optionSchema).check(
  z.maxLength(20),
  z.refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'Choice identities must be unique.',
  ),
);
const unitSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('percent') }),
  z.strictObject({
    kind: z.literal('currency'),
    code: z
      .string()
      .check(
        z.refine((value) => currencies.has(value), 'Choose an ISO currency.'),
      ),
  }),
  z.strictObject({
    kind: z.literal('custom'),
    label: plainText(32),
  }),
]);
const count = (min: number, max: number) =>
  z.int().check(z.minimum(min), z.maximum(max));
const bound = z.optional(
  z
    .number()
    .check(
      z.minimum(-Number.MAX_SAFE_INTEGER),
      z.maximum(Number.MAX_SAFE_INTEGER),
    ),
);
const textField = <T extends 'short-text' | 'long-text'>(
  type: T,
  max: number,
) =>
  z.strictObject({
    ...common,
    type: z.literal(type),
    minLength: count(0, max),
    maxLength: count(1, max),
  });

export const blockSchema = z.discriminatedUnion('type', [
  textField('short-text', 500),
  textField('long-text', 10000),
  z.strictObject({ ...common, type: z.literal('email') }),
  z.strictObject({
    ...common,
    type: z.literal('number'),
    unit: unitSchema,
    min: bound,
    max: bound,
  }),
  z.strictObject({ ...common, type: z.literal('single-choice'), options }),
  z.strictObject({
    ...common,
    type: z.literal('multiple-choice'),
    options,
    minSelections: count(0, 20),
    maxSelections: count(1, 20),
  }),
  z.strictObject({
    ...common,
    type: z.literal('date'),
    min: z.optional(z.iso.date()),
    max: z.optional(z.iso.date()),
  }),
  z.strictObject({ ...common, type: z.literal('acknowledgment') }),
  z.strictObject({
    ...common,
    type: z.literal('file'),
    aiEnabled: z.literal(false),
    maxFiles: count(1, 3),
  }),
  z.strictObject({ id: identity, type: z.literal('heading'), text: label }),
  z.strictObject({
    id: identity,
    type: z.literal('help'),
    text: plainText(10000),
  }),
]);
export type Block = z.infer<typeof blockSchema>;
export type Field = Exclude<Block, { type: 'heading' | 'help' }>;

export const formDefinitionSchema = z
  .strictObject({
    contractVersion: z.literal(1),
    title: plainText(120),
    description: plainText(2000),
    presentation: z.enum(['page', 'card']),
    rules: z.array(ruleSchema).check(z.maxLength(30)),
    endings: z
      .array(
        z.strictObject({
          id: identity,
          title: label,
          description: plainText(2000),
        }),
      )
      .check(z.minLength(1), z.maxLength(10)),
    defaultEndingId: identity,
    pages: z
      .array(
        z.strictObject({
          id: identity,
          title: plainText(120),
          blocks: z.array(blockSchema).check(z.maxLength(150)),
        }),
      )
      .check(z.minLength(1), z.maxLength(10)),
  })
  .check(
    z.superRefine((definition, context) => {
      const identities = new Set<string>();
      let fields = 0;
      let content = 0;
      const add = (id: string) => {
        if (identities.has(id))
          context.addIssue({
            code: 'custom',
            message: 'Every page, field and option needs a unique identity.',
          });
        identities.add(id);
      };
      for (const rule of definition.rules) add(rule.id);
      for (const ending of definition.endings) add(ending.id);
      for (const page of definition.pages) {
        add(page.id);
        for (const block of page.blocks) {
          add(block.id);
          if (block.type === 'heading' || block.type === 'help') content++;
          else fields++;
          if (
            block.type === 'single-choice' ||
            block.type === 'multiple-choice'
          )
            for (const option of block.options) add(option.id);
        }
      }
      if (fields > 50)
        context.addIssue({
          code: 'custom',
          message: 'Use no more than 50 answer fields.',
        });
      if (content > 100)
        context.addIssue({
          code: 'custom',
          message: 'Use no more than 100 content blocks.',
        });
      if (
        new TextEncoder().encode(JSON.stringify(definition)).byteLength > 262144
      )
        context.addIssue({
          code: 'custom',
          message: 'The form definition exceeds 256 KiB.',
          params: { reason: 'definition-size' },
        });
    }),
  );
export type FormDefinition = z.infer<typeof formDefinitionSchema>;
