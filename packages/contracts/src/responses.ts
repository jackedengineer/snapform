import { z } from 'zod';
import { formCursorSchema, formsQuerySchema } from './draft.ts';
import { formDefinitionSchema } from './form.ts';
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
const summary = z.strictObject({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.int().positive(),
  submittedAt: z.iso.datetime(),
});
export const responsePageSchema = z.strictObject({
  responses: z.array(summary).max(20),
  role: roleSchema,
  nextCursor: z.string().max(512).nullable(),
});
export const responseDetailSchema = z.strictObject({
  response: summary.extend({
    definition: formDefinitionSchema,
    answers: sessionAnswersSchema,
  }),
});
export type ResponsePage = z.infer<typeof responsePageSchema>;
export type ResponseDetail = z.infer<typeof responseDetailSchema>['response'];
