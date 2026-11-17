import type { Block, FormDefinition } from '@snapform/contracts/form';
// Option A, B, C… answers to the matching letter key. Anything else (digits,
// Enter, named keys, accented letters) is left to the browser.
export function optionIndexForKey(key: string, count: number) {
  if (!/^[a-z]$/i.test(key)) return -1;
  const index = key.toLowerCase().charCodeAt(0) - 97;
  return index < count ? index : -1;
}
// A card holding one single choice moves on as soon as it is answered: there
// is nothing else on it to fill in. Pages of several questions never do.
export function choiceAdvances(
  blocks: Block[],
  presentation: FormDefinition['presentation'],
) {
  if (presentation !== 'card') return false;
  const fields = blocks.filter((block) => 'required' in block);
  return fields.length === 1 && fields[0].type === 'single-choice';
}
