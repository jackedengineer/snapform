import {
  formDefinitionSchema,
  type FormDefinition,
} from '@snapform/contracts/form';
import { compilePublication } from '@snapform/contracts/publication';
import { definitionKey } from './autosave';
import { blockCaption, blockNames, questionNumbers } from './new-form';

export type PublishingIssue = { message: string; targetId?: string };
// Readiness names what needs attention, using the outline's numbering.
export function publishingIssues(
  definition: FormDefinition,
): PublishingIssue[] {
  const result = compilePublication(definition);
  if (result.ok) return [];
  const numbers = questionNumbers(definition);
  const blocks = new Map(
    definition.pages.flatMap((page) => page.blocks).map((b) => [b.id, b]),
  );
  const rules = [...definition.rules].sort((a, b) => a.priority - b.priority);
  return result.issues.map(({ message, targetId }) => {
    const block = targetId ? blocks.get(targetId) : undefined;
    const rule = rules.findIndex((item) => item.id === targetId);
    const ending = definition.endings.findIndex((item) => item.id === targetId);
    const subject = !block
      ? rule >= 0
        ? `Rule ${rule + 1}`
        : ending >= 0
          ? `Ending ${ending + 1}`
          : ''
      : !('label' in block)
        ? blockNames[block.type]
        : block.label.trim()
          ? `Question ${numbers.get(block.id)}, “${blockCaption(block)}”`
          : `Question ${numbers.get(block.id)} (${blockNames[block.type]})`;
    return { message: subject ? `${subject}: ${message}` : message, targetId };
  });
}

export async function preparePublication(
  definition: FormDefinition,
  flush: () => Promise<void> | undefined,
  read: () => Promise<{ definition: FormDefinition; revision: number }>,
) {
  const candidate = compilePublication(definition);
  if (!candidate.ok)
    throw new Error('Resolve the form’s publishing issues first.');
  await flush();
  const saved = await read();
  if (
    definitionKey(formDefinitionSchema.parse(saved.definition)) !==
    definitionKey(candidate.definition)
  )
    throw new Error(
      'Save these changes before publishing. Your current draft has not been published.',
    );
  return saved.revision;
}
