import type { Block, FormDefinition } from '@snapform/contracts/form';

export function insertQuestion(
  definition: FormDefinition,
  pageId: string,
  selectedId: string | null,
  block: Block,
): FormDefinition | null {
  const content = !('required' in block);
  const count = definition.pages
    .flatMap((page) => page.blocks)
    .filter((item) => !('required' in item) === content).length;
  if (
    count >= (content ? 100 : 50) ||
    !definition.pages.some((page) => page.id === pageId)
  )
    return null;
  return {
    ...definition,
    pages: definition.pages.map((page) => {
      if (page.id !== pageId) return page;
      const index = page.blocks.findIndex((item) => item.id === selectedId);
      const position = index < 0 ? page.blocks.length : index + 1;
      return {
        ...page,
        blocks: [
          ...page.blocks.slice(0, position),
          block,
          ...page.blocks.slice(position),
        ],
      };
    }),
  };
}
