import type { FormDefinition } from '@snapform/contracts/form';
import type { Answer } from '@snapform/contracts/answers';
import { evaluateForm } from '@snapform/contracts/evaluate';
import { collectionSteps } from '../intake/steps';

export function previewState(
  definition: FormDefinition,
  answers: Record<string, Answer>,
  stepId: string,
) {
  const evaluation = evaluateForm(definition, answers);
  if (!evaluation.ok) return evaluation;
  const steps = collectionSteps(definition, evaluation);
  const index = Math.max(
    0,
    steps.findIndex((step) => step.id === stepId),
  );
  const step = steps[index];
  const ids = new Set(step?.blocks.map((block) => block.id));
  return {
    ok: true as const,
    steps,
    index,
    step,
    issues: evaluation.issues.filter(
      (issue) => issue.targetId && ids.has(issue.targetId),
    ),
    ending: definition.endings.find(
      (ending) => ending.id === evaluation.endingId,
    ),
  };
}
