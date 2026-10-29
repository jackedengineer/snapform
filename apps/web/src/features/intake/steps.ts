import type { FormDefinition, Block } from '@snapform/contracts/form';
import type { FormEvaluation } from '@snapform/contracts/evaluate';
export type CollectionStep = {
  id: string;
  pageId: string;
  title: string;
  blocks: Block[];
};
export function collectionSteps(
  definition: FormDefinition,
  evaluation: Extract<FormEvaluation, { ok: true }>,
) {
  const steps: CollectionStep[] = [];
  for (const pageId of evaluation.pageIds) {
    const page = definition.pages.find((page) => page.id === pageId);
    if (!page) continue;
    const blocks = page.blocks.filter(
      (block) =>
        !('required' in block) ||
        evaluation.answers[block.id]?.state !== 'not-applicable',
    );
    if (definition.presentation === 'page') {
      steps.push({ id: page.id, pageId, title: page.title, blocks });
      continue;
    }
    let content: Block[] = [];
    for (const block of blocks) {
      content.push(block);
      if ('required' in block) {
        steps.push({
          id: block.id,
          pageId,
          title: page.title,
          blocks: content,
        });
        content = [];
      }
    }
    if (content.length) {
      const previous = steps.at(-1);
      if (previous?.pageId === pageId) previous.blocks.push(...content);
      else
        steps.push({ id: pageId, pageId, title: page.title, blocks: content });
    }
  }
  return steps;
}
