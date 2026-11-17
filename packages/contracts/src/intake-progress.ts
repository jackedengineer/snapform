import { intakeEnvelopeSchema, capabilitySchema } from './intake.ts';
import { z } from './zod.ts';
import { answerInputSchema } from './answers.ts';
import { evaluateForm } from './evaluate.ts';
import type { Answer } from './answers.ts';
import type { CompileIssue } from './compile.ts';
const identity = z.pipe(
  z.uuid(),
  z.transform((id: string) => id.toLowerCase()),
);
const revision = (min: number, max: number) =>
  z.int().check(z.minimum(min), z.maximum(max));
export const intakeProgressSchema = z
  .record(identity, answerInputSchema)
  .check(z.refine((answers) => Object.keys(answers).length <= 50));
export const intakeMutationSchema = z.strictObject({
  operationId: identity,
  expectedRevision: revision(1, 2147483646),
  answers: intakeProgressSchema,
});
export const intakeMutationReceiptSchema = z.strictObject({
  operationId: identity,
  revision: revision(2, 2147483647),
  currentRevision: revision(2, 2147483647),
  status: z.enum(['collecting', 'submitted']),
});
export type IntakeMutation = z.infer<typeof intakeMutationSchema>;
export type IntakeMutationReceipt = z.infer<typeof intakeMutationReceiptSchema>;
export function prepareIntakeProgress(
  definition: unknown,
  raw: unknown,
  submit: boolean,
):
  | { ok: true; answers: Record<string, Answer>; endingId: string }
  | { ok: false; issues: CompileIssue[] } {
  const parsed = intakeProgressSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      issues: [
        {
          code: 'INVALID_ANSWERS',
          message: 'Use bounded explicit answers for this form.',
        },
      ],
    };
  const evaluated = evaluateForm(definition, parsed.data);
  if (!evaluated.ok) return evaluated;
  if (submit && !evaluated.complete)
    return { ok: false, issues: evaluated.issues };
  return {
    ok: true,
    answers: submit ? evaluated.answers : parsed.data,
    endingId: evaluated.endingId,
  };
}

export const intakeRecoverySchema = z
  .strictObject({
    version: z.literal(1),
    publicId: identity,
    identity: z.strictObject({ id: identity, capability: capabilitySchema }),
    expiresAt: z.int().check(z.positive()),
    session: z.nullable(intakeEnvelopeSchema.shape.session),
    pending: z.nullable(
      z.strictObject({
        kind: z.enum(['save', 'submit']),
        input: intakeMutationSchema,
      }),
    ),
  })
  .check(
    z.refine((record) =>
      !record.session
        ? record.pending === null
        : record.session.id === record.identity.id &&
          record.session.publicId === record.publicId &&
          Date.parse(record.session.expiresAt) === record.expiresAt &&
          (!record.pending ||
            record.pending.input.expectedRevision === record.session.revision),
    ),
  );
export type IntakeRecovery = z.infer<typeof intakeRecoverySchema>;
