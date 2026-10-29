import { z } from 'zod';
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
