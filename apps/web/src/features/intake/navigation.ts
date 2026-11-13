import type { FormEvaluation } from '@snapform/contracts/evaluate';
import type { CollectionStep } from './steps';
export type CollectorSearch = {
  step?: number | 'review';
  edit?: true;
  embed?: 1;
};
export type Position = { index: number; review: boolean };
// The address carries only a position and embed mode, never answers or
// capabilities.
export function readCollectorSearch(
  search: Record<string, unknown>,
): CollectorSearch {
  const step = search.step;
  const result: CollectorSearch = search.embed === 1 ? { embed: 1 } : {};
  if (step === 'review') result.step = step;
  else if (
    typeof step === 'number' &&
    Number.isInteger(step) &&
    step >= 1 &&
    step <= 1000
  ) {
    result.step = step;
    if (search.edit === true) result.edit = true;
  }
  return result;
}
export function resolvePosition(
  steps: CollectionStep[],
  evaluation: Extract<FormEvaluation, { ok: true }>,
  answers: Record<string, unknown>,
  search: CollectorSearch,
  reviewAlways = false,
): Position {
  const unfinished = new Set(
    evaluation.issues.flatMap((issue) =>
      issue.targetId ? [issue.targetId] : [],
    ),
  );
  const fields = (step: CollectionStep) =>
    step.blocks.filter((block) => 'required' in block);
  const blocked = steps.findIndex((step) =>
    fields(step).some((field) => unfinished.has(field.id)),
  );
  const limit = blocked === -1 ? steps.length : blocked;
  const last = Math.max(0, steps.length - 1);
  if (search.step === 'review')
    return reviewAlways || limit === steps.length
      ? { index: last, review: true }
      : { index: limit, review: false };
  if (search.step)
    return {
      index: Math.min(search.step - 1, limit, last),
      review: false,
    };
  // Without an address, resume at the first step not yet finished or touched.
  const resume = steps.findIndex(
    (step, index) =>
      index >= limit ||
      fields(step).every((field) => answers[field.id] === undefined),
  );
  return resume === -1
    ? { index: last, review: true }
    : { index: resume, review: false };
}
