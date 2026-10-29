import { z } from 'zod';
import { answerInputSchema } from './answers.ts';
import { evaluateForm } from './evaluate.ts';
import type { Answer } from './answers.ts';
import type { CompileIssue } from './compile.ts';
const identity = z.uuid().transform((id) => id.toLowerCase());
export const intakeProgressSchema = z
  .record(identity, answerInputSchema)
  .refine((answers) => Object.keys(answers).length <= 50);
export const intakeMutationSchema = z.strictObject({
  operationId: identity,
  expectedRevision: z.int().min(1).max(2147483646),
  answers: intakeProgressSchema,
});
export const intakeMutationReceiptSchema = z.strictObject({
  operationId: identity,
  revision: z.int().min(2).max(2147483647),
  currentRevision: z.int().min(2).max(2147483647),
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
