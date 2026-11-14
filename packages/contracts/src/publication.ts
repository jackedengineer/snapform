import { z } from './zod.ts';
import { compileDefinition, type CompileResult } from './compile.ts';
const identity = z.pipe(
  z.uuid(),
  z.transform((value: string) => value.toLowerCase()),
);
const positive = z.int().check(z.minimum(1), z.maximum(2147483647));
export const publishFormSchema = z.strictObject({
  versionId: identity,
  expectedRevision: positive,
});
export const unpublishFormSchema = z.strictObject({
  expectedVersionId: identity,
});
export const publicationSchema = z.strictObject({
  publicId: identity,
  versionId: identity,
  number: positive,
  sourceRevision: positive,
  active: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export const publicationEnvelopeSchema = z.strictObject({
  publication: z.nullable(publicationSchema),
});
export const publicationReceiptSchema = z.strictObject({
  versionId: identity,
  number: positive,
  sourceRevision: positive,
  publication: z.nullable(publicationSchema),
});
export type PublishForm = z.infer<typeof publishFormSchema>;
export type UnpublishForm = z.infer<typeof unpublishFormSchema>;
export type Publication = z.infer<typeof publicationSchema>;
// Publishing compiles the saved draft. Plan features (file questions need
// uploads) are checked separately by canPublishQuestions in plans.ts, because
// the browser does not know the workspace plan.
export function compilePublication(raw: unknown): CompileResult {
  return compileDefinition(raw);
}
