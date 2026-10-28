import { z } from 'zod';
import { formDefinitionSchema } from './form.ts';
const identity = z.uuid().transform((value) => value.toLowerCase());
const revision = z.int().min(1).max(2147483647);
export const createFormSchema = z.strictObject({
  id: identity,
  definition: formDefinitionSchema,
});
export const saveDraftSchema = z.strictObject({
  operationId: identity,
  expectedRevision: z.int().min(1).max(2147483646),
  definition: formDefinitionSchema,
});
export const draftReceiptSchema = z
  .strictObject({
    id: identity,
    operationId: identity,
    revision,
    currentRevision: revision,
  })
  .refine(
    (value) => value.currentRevision >= value.revision,
    'An operation cannot be ahead of the saved draft.',
  );
export type CreateForm = z.infer<typeof createFormSchema>;
export type SaveDraft = z.infer<typeof saveDraftSchema>;
