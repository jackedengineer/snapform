import { z } from './zod.ts';
import { publicFormEnvelopeSchema } from './public-form.ts';
import { answerInputSchema } from './answers.ts';
const publicForm = publicFormEnvelopeSchema.shape.form;
const identity = publicForm.shape.publicId;
export const capabilitySchema = z
  .string()
  .check(z.regex(/^[A-Za-z0-9_-]{43}$/));
export const capabilityHashSchema = z.string().check(z.regex(/^[0-9a-f]{64}$/));
export const createIntakeSchema = z.strictObject({
  id: identity,
  challengeToken: z.string().check(z.minLength(1), z.maxLength(2048)),
});
export const sessionAnswersSchema = z
  .record(
    identity,
    z.union([
      answerInputSchema,
      z.strictObject({ state: z.literal('not-applicable') }),
    ]),
  )
  .check(z.refine((answers) => Object.keys(answers).length <= 50));
export const intakeEnvelopeSchema = z.strictObject({
  session: z.strictObject({
    id: identity,
    publicId: identity,
    versionId: identity,
    definition: publicForm.shape.definition,
    revision: z.int().check(z.minimum(1), z.maximum(2147483647)),
    answers: sessionAnswersSchema,
    expiresAt: z.iso.datetime(),
    status: z.enum(['collecting', 'submitted']),
  }),
});
export type IntakeSession = z.infer<typeof intakeEnvelopeSchema>['session'];

export const intakeConfigurationSchema = z.strictObject({
  siteKey: z
    .string()
    .check(z.minLength(1), z.maxLength(100), z.regex(/^[A-Za-z0-9_-]+$/)),
});
