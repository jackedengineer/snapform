import type { FormDefinition } from '@snapform/contracts/form';
export function addEnding(definition: FormDefinition): FormDefinition | null {
  if (definition.endings.length >= 10) return null;
  return {
    ...definition,
    endings: [
      ...definition.endings,
      { id: crypto.randomUUID(), title: 'Thank you.', description: '' },
    ],
  };
}
export function canRemoveEnding(definition: FormDefinition, endingId: string) {
  return (
    definition.endings.length > 1 &&
    endingId !== definition.defaultEndingId &&
    definition.endings.some((ending) => ending.id === endingId) &&
    !definition.rules.some(
      ({ action }) => action.type === 'end' && action.endingId === endingId,
    )
  );
}
export function removeEnding(
  definition: FormDefinition,
  endingId: string,
): FormDefinition | null {
  if (!canRemoveEnding(definition, endingId)) return null;
  return {
    ...definition,
    endings: definition.endings.filter((ending) => ending.id !== endingId),
  };
}
