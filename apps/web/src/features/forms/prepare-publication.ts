import {
  formDefinitionSchema,
  type FormDefinition,
} from '@snapform/contracts/form';
import { compileDefinition } from '@snapform/contracts/compile';
import { definitionKey } from './autosave';

export async function preparePublication(
  definition: FormDefinition,
  flush: () => Promise<void> | undefined,
  read: () => Promise<{ definition: FormDefinition; revision: number }>,
) {
  const candidate = compileDefinition(definition);
  if (
    !candidate.ok ||
    candidate.definition.pages.some((page) =>
      page.blocks.some((block) => block.type === 'file'),
    )
  )
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
