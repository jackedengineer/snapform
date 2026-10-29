import { z } from 'zod';
import { formDefinitionSchema } from './form.ts';
import { publicationSchema } from './publication.ts';
export const publicFormEnvelopeSchema = z.strictObject({
  form: z.strictObject({
    publicId: publicationSchema.shape.publicId,
    versionId: publicationSchema.shape.versionId,
    definition: formDefinitionSchema,
  }),
});
export type PublicForm = z.infer<typeof publicFormEnvelopeSchema>['form'];
