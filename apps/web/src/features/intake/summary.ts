import type { FormEvaluation } from '@snapform/contracts/evaluate';
import type { Answer } from '@snapform/contracts/answers';
import type { Field } from '@snapform/contracts/form';
import { formatResponseAnswer } from '@snapform/contracts/response-display';
import type { CollectionStep } from './steps';
export type ReviewRow = {
  id: string;
  label: string;
  answer: string;
  stepIndex: number;
  issue?: string;
};
export type ReviewSection = {
  pageId: string;
  title: string;
  rows: ReviewRow[];
};
function readable(field: Field, answer: Answer | undefined) {
  if (!answer || answer.state !== 'value')
    return answer?.state === 'refused'
      ? 'Prefer not to answer'
      : 'Not answered';
  return formatResponseAnswer(field, answer);
}
export function reviewSections(
  steps: CollectionStep[],
  evaluation: Extract<FormEvaluation, { ok: true }>,
) {
  const sections: ReviewSection[] = [];
  steps.forEach((step, stepIndex) => {
    let section = sections.at(-1);
    if (section?.pageId !== step.pageId) {
      section = { pageId: step.pageId, title: step.title, rows: [] };
      sections.push(section);
    }
    for (const block of step.blocks) {
      if (!('required' in block)) continue;
      const issue = evaluation.issues.find(
        (item) => item.targetId === block.id,
      )?.message;
      section.rows.push({
        id: block.id,
        label: block.label,
        answer: readable(block, evaluation.answers[block.id]),
        stepIndex,
        ...(issue ? { issue } : {}),
      });
    }
  });
  return sections.filter((section) => section.rows.length);
}
