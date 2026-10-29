import { z } from 'zod';
import { publicFormEnvelopeSchema } from './public-form.ts';
import { answerInputSchema } from './answers.ts';
const publicForm = publicFormEnvelopeSchema.shape.form;
const identity = publicForm.shape.publicId;
export const capabilitySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const capabilityHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const createIntakeSchema = z.strictObject({
  id: identity,
  challengeToken: z.string().min(1).max(2048),
});
export const sessionAnswersSchema = z
  .record(
    identity,
    z.union([
      answerInputSchema,
      z.strictObject({ state: z.literal('not-applicable') }),
    ]),
  )
  .refine((answers) => Object.keys(answers).length <= 50);
export const intakeEnvelopeSchema = z.strictObject({
  session: z.strictObject({
    id: identity,
    publicId: identity,
    versionId: identity,
    definition: publicForm.shape.definition,
    revision: z.int().min(1).max(2147483647),
    answers: sessionAnswersSchema,
    expiresAt: z.iso.datetime(),
    status: z.enum(['collecting', 'submitted']),
  }),
});
export type IntakeSession = z.infer<typeof intakeEnvelopeSchema>['session'];
