import { z } from './zod.ts';
import { formDefinitionSchema } from './form.ts';
import { publicationSchema } from './publication.ts';
import { isStorableText } from './text.ts';
// The business behind a form, as respondents see it. Unknown fields are
// dropped rather than rejected, so later details such as a logo or accent
// can be added without breaking forms that are already open.
export const publicBusinessSchema = z.object({
  name: z
    .string()
    .check(z.trim(), z.minLength(1), z.maxLength(80), z.refine(isStorableText)),
});
export type PublicBusiness = z.infer<typeof publicBusinessSchema>;
export const publicFormEnvelopeSchema = z.strictObject({
  form: z.strictObject({
    publicId: publicationSchema.shape.publicId,
    versionId: publicationSchema.shape.versionId,
    definition: formDefinitionSchema,
    // Absent when the lookup predates business names.
    business: z.optional(publicBusinessSchema),
  }),
});
export type PublicForm = z.infer<typeof publicFormEnvelopeSchema>['form'];
// Respondents see the workspace name. A missing or unusable one leaves the
// form on its generic wording rather than failing the whole form.
export function publicBusiness(name: unknown): PublicBusiness | undefined {
  const business = publicBusinessSchema.safeParse({ name });
  return business.success ? business.data : undefined;
}
