import { z } from './zod.ts';
import { formCursorSchema, formsQuerySchema } from './draft.ts';
import { formDefinitionSchema } from './form.ts';
import type { Block, FormDefinition } from './form.ts';
import { sessionAnswersSchema } from './intake.ts';
import { roleSchema } from './workspace.ts';
export const responseQuerySchema = formsQuerySchema;
export function decodeResponseCursor(token?: string) {
  if (token === undefined) return undefined;
  const input = formsQuerySchema.parse({ cursor: token }).cursor;
  if (!input) throw Error('INVALID_CURSOR');
  return formCursorSchema.parse(
    JSON.parse(atob(input.replaceAll('-', '+').replaceAll('_', '/'))),
  );
}
export function encodeResponseCursor(
  cursor: z.infer<typeof formCursorSchema> | null,
) {
  return cursor
    ? btoa(JSON.stringify(formCursorSchema.parse(cursor)))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '')
    : null;
}
export const SUMMARY_TEXT_LENGTH = 120;
export const MAX_LISTED_VERSIONS = 100;
// One display line: collapse whitespace and never end inside a surrogate pair.
export function clipSummaryText(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= SUMMARY_TEXT_LENGTH) return text;
  let end = SUMMARY_TEXT_LENGTH - 1;
  if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return `${text.slice(0, end).trimEnd()}…`;
}
const personName = /\bname\b/i;
const otherName =
  /\b(?:company|business|organi[sz]ation|agency|brand|project|product|team|school|store|shop|website|site|domain|file|event|app|pet)\b/i;
export function looksLikePersonName(label: string): boolean {
  return personName.test(label) && !otherName.test(label);
}
// answeredText holds string answers by field id; other answer kinds are ignored.
export function summarizeResponse(
  definition: FormDefinition,
  answeredText: Readonly<Record<string, string>>,
) {
  const blocks = definition.pages.flatMap((page) => page.blocks);
  const first = (matches: (block: Block) => boolean) => {
    for (const block of blocks) {
      const text = matches(block)
        ? clipSummaryText(answeredText[block.id] ?? '')
        : null;
      if (text) return text;
    }
    return null;
  };
  return {
    respondent:
      first(
        (block) =>
          block.type === 'short-text' && looksLikePersonName(block.label),
      ) ?? first((block) => block.type === 'email'),
    preview: first((block) => block.type === 'long-text'),
  };
}
const summary = z.strictObject({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.int().check(z.positive()),
  submittedAt: z.iso.datetime(),
});
const summaryText = z.nullable(
  z.string().check(z.minLength(1), z.maxLength(SUMMARY_TEXT_LENGTH)),
);
export const responsePageSchema = z.strictObject({
  title: formDefinitionSchema.shape.title,
  responses: z
    .array(z.extend(summary, { respondent: summaryText, preview: summaryText }))
    .check(z.maxLength(20)),
  versions: z
    .array(
      z.strictObject({ id: z.uuid(), number: z.int().check(z.positive()) }),
    )
    .check(z.maxLength(MAX_LISTED_VERSIONS)),
  role: roleSchema,
  nextCursor: z.nullable(z.string().check(z.maxLength(512))),
});
export const responseDetailSchema = z.strictObject({
  response: z.extend(summary, {
    definition: formDefinitionSchema,
    answers: sessionAnswersSchema,
  }),
});
export type ResponsePage = z.infer<typeof responsePageSchema>;
export type ResponseDetail = z.infer<typeof responseDetailSchema>['response'];
