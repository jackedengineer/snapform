import type { FormDefinition } from '@snapform/contracts/form';
export function addPage(definition: FormDefinition): FormDefinition | null {
  if (definition.pages.length >= 10) return null;
  return {
    ...definition,
    pages: [
      ...definition.pages,
      { id: crypto.randomUUID(), title: 'New page', blocks: [] },
    ],
  };
}
export function canRemovePage(definition: FormDefinition, pageId: string) {
  const page = definition.pages.find((page) => page.id === pageId);
  return (
    !!page &&
    !page.blocks.length &&
    definition.pages.length > 1 &&
    !definition.rules.some(({ action }) =>
      action.type === 'go-to'
        ? action.fromPageId === pageId || action.pageId === pageId
        : action.type === 'end' && action.fromPageId === pageId,
    )
  );
}
export function removePage(
  definition: FormDefinition,
  pageId: string,
): FormDefinition | null {
  if (!canRemovePage(definition, pageId)) return null;
  return {
    ...definition,
    pages: definition.pages.filter((page) => page.id !== pageId),
  };
}
export function movePage(
  definition: FormDefinition,
  pageId: string,
  direction: -1 | 1,
): FormDefinition | null {
  const index = definition.pages.findIndex((page) => page.id === pageId),
    target = index + direction;
  if (index < 0 || target < 0 || target >= definition.pages.length) return null;
  const pages = [...definition.pages];
  [pages[index], pages[target]] = [pages[target], pages[index]];
  return { ...definition, pages };
}
export function moveBlockToPage(
  definition: FormDefinition,
  blockId: string,
  pageId: string,
): FormDefinition | null {
  const source = definition.pages.find((page) =>
    page.blocks.some((block) => block.id === blockId),
  );
  const target = definition.pages.find((page) => page.id === pageId);
  const block = source?.blocks.find((block) => block.id === blockId);
  if (!source || !target || !block) return null;
  if (source.id === target.id) return definition;
  return {
    ...definition,
    pages: definition.pages.map((page) =>
      page.id === source.id
        ? { ...page, blocks: page.blocks.filter((item) => item.id !== blockId) }
        : page.id === target.id
          ? { ...page, blocks: [...page.blocks, block] }
          : page,
    ),
  };
}
