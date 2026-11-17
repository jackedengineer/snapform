import { z } from './zod.ts';
import { formDefinitionSchema } from './form.ts';
import { roleSchema, workspaceSchema } from './workspace.ts';
const identity = z.pipe(
  z.uuid(),
  z.transform((value: string) => value.toLowerCase()),
);
const revision = z.int().check(z.minimum(1), z.maximum(2147483647));
export const createFormSchema = z.strictObject({
  id: identity,
  definition: formDefinitionSchema,
});
export const saveDraftSchema = z.strictObject({
  operationId: identity,
  expectedRevision: z.int().check(z.minimum(1), z.maximum(2147483646)),
  definition: formDefinitionSchema,
});
export const draftReceiptSchema = z
  .strictObject({
    id: identity,
    operationId: identity,
    revision,
    currentRevision: revision,
  })
  .check(
    z.refine(
      (value) => value.currentRevision >= value.revision,
      'An operation cannot be ahead of the saved draft.',
    ),
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
  .check(z.maxLength(512), z.regex(/^[A-Za-z0-9_-]+$/));
export const formsQuerySchema = z.strictObject({
  cursor: z.optional(cursorToken),
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
// The list counts at most this many submitted responses per form, so a busy
// form cannot slow every workspace page. The limit itself means "or more".
export const formListResponseLimit = 1000;
export const formStatusSchema = z.enum(['draft', 'live', 'stopped']);
export type FormStatus = z.infer<typeof formStatusSchema>;
export function formStatus(active: boolean | null): FormStatus {
  return active === null ? 'draft' : active ? 'live' : 'stopped';
}
export const formsPageSchema = z.strictObject({
  workspace: workspaceSchema,
  forms: z
    .array(
      z.strictObject({
        id: identity,
        title: formDefinitionSchema.shape.title,
        revision,
        updatedAt: z.iso.datetime(),
        status: formStatusSchema,
        responseCount: z
          .int()
          .check(z.minimum(0), z.maximum(formListResponseLimit)),
      }),
    )
    .check(z.maxLength(20)),
  nextCursor: z.nullable(cursorToken),
});
export type FormSnapshot = z.infer<typeof formSnapshotSchema>;
export type FormsPage = z.infer<typeof formsPageSchema>;
// Browser recovery is form authoring data only, never an authentication cache.
export const localDraftSchema = z
  .strictObject({
    version: z.literal(1),
    userId: z.string().check(z.minLength(1), z.maxLength(128)),
    workspaceId: identity,
    formId: identity,
    editorId: identity,
    updatedAt: z.int().check(z.nonnegative()),
    revision,
    definition: formDefinitionSchema,
    pending: z.nullable(saveDraftSchema),
    backup: z.nullable(formDefinitionSchema),
  })
  .check(
    z.refine(
      (value) =>
        !value.pending || value.pending.expectedRevision === value.revision,
    ),
  );
export type LocalDraft = z.infer<typeof localDraftSchema>;
