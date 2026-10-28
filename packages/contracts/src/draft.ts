import { z } from 'zod';
import { formDefinitionSchema } from './form.ts';
import { roleSchema, workspaceSchema } from './workspace.ts';
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
export const formCursorSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  id: identity,
});
export type FormCursor = z.infer<typeof formCursorSchema>;
const cursorToken = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);
export const formsQuerySchema = z.strictObject({
  cursor: cursorToken.optional(),
});
export const formSnapshotSchema = z.strictObject({
  id: identity,
  workspaceId: identity,
  revision,
  definition: formDefinitionSchema,
  updatedAt: z.iso.datetime(),
  role: roleSchema,
});
export const formEnvelopeSchema = z.strictObject({ form: formSnapshotSchema });
export const formsPageSchema = z.strictObject({
  workspace: workspaceSchema,
  forms: z
    .array(
      z.strictObject({
        id: identity,
        title: formDefinitionSchema.shape.title,
        revision,
        updatedAt: z.iso.datetime(),
      }),
    )
    .max(20),
  nextCursor: cursorToken.nullable(),
});
export type FormSnapshot = z.infer<typeof formSnapshotSchema>;
export type FormsPage = z.infer<typeof formsPageSchema>;
