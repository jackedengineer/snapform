import { z } from 'zod';
import { compileDefinition, type CompileResult } from './compile.ts';
import type { FormDefinition } from './form.ts';
const identity = z.uuid().transform((value) => value.toLowerCase());
const positive = z.int().min(1).max(2147483647);
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
  publication: publicationSchema.nullable(),
});
export const publicationReceiptSchema = z.strictObject({
  versionId: identity,
  number: positive,
  sourceRevision: positive,
  publication: publicationSchema.nullable(),
});
export type PublishForm = z.infer<typeof publishFormSchema>;
export type UnpublishForm = z.infer<typeof unpublishFormSchema>;
export type Publication = z.infer<typeof publicationSchema>;
// A definition can be valid to save but not yet collectable. The public form
// refuses file questions until the quarantine and scanning slice ships, so
// publishing refuses them too.
export function compilePublication(raw: unknown): CompileResult {
  const compiled = compileDefinition(raw);
  if (
    !compiled.ok &&
    compiled.issues.some((issue) => issue.code === 'INVALID_DEFINITION')
  )
    return compiled;
  // Without INVALID_DEFINITION issues, the schema accepted this exact shape.
  const definition = compiled.ok
    ? compiled.definition
    : (raw as FormDefinition);
  const files = definition.pages
    .flatMap((page) => page.blocks)
    .filter((block) => block.type === 'file')
    .map((block) => ({
      code: 'FILE_COLLECTION_UNAVAILABLE',
      message:
        'File upload isn’t available yet. Remove this question to publish.',
      targetId: block.id,
    }));
  if (!files.length) return compiled;
  return {
    ok: false,
    issues: [...(compiled.ok ? [] : compiled.issues), ...files],
  };
}
