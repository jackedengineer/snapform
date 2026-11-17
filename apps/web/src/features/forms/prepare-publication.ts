import {
  formDefinitionSchema,
  type FormDefinition,
} from '@snapform/contracts/form';
import {
  compilePublication,
  type Publication,
} from '@snapform/contracts/publication';
import { definitionKey } from './autosave';
import { blockCaption, blockNames, questionNumbers } from './new-form';
import { conditionFields } from './rule-editing';

export type PublishStatus = 'draft' | 'live' | 'changes' | 'stopped';
export function publishStatus(
  publication: Publication | null,
  revision: number,
  dirty: boolean,
): PublishStatus {
  if (!publication) return 'draft';
  if (!publication.active) return 'stopped';
  return publication.sourceRevision === revision && !dirty ? 'live' : 'changes';
}
export const statusLabels: Record<PublishStatus, string> = {
  draft: 'Draft',
  live: 'Live',
  changes: 'Live · unpublished changes',
  stopped: 'Stopped',
};
// "failed" means the same operation is kept for an exact retry.
export type OperationPhase = 'idle' | 'running' | 'failed';
export function publishLabel(status: PublishStatus, phase: OperationPhase) {
  if (phase === 'running') return 'Publishing…';
  if (phase === 'failed') return 'Retry publishing';
  return status === 'live'
    ? 'Published'
    : status === 'changes'
      ? 'Publish changes'
      : 'Publish';
}
export function publishReason(
  issues: number,
  save: 'saved' | 'saving' | 'conflict' | 'blocked',
) {
  if (save === 'conflict') return 'Review the edit conflict before publishing.';
  if (save === 'blocked') return 'Saving is paused. Review the message below.';
  if (!issues) return '';
  return `${issues} ${issues === 1 ? 'thing' : 'things'} to fix before publishing.`;
}

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
  const name = (id: string) => {
    const block = blocks.get(id);
    return block && 'label' in block && block.label.trim()
      ? `“${blockCaption(block)}”`
      : `question ${numbers.get(id)}`;
  };
  const seen = new Set<string>();
  return result.issues
    .map(({ code, message, targetId }) => {
      const block = targetId ? blocks.get(targetId) : undefined;
      const rule = rules.findIndex((item) => item.id === targetId);
      const ending = definition.endings.findIndex(
        (item) => item.id === targetId,
      );
      if (code === 'FORWARD_DEPENDENCY' && rule >= 0) {
        const { action, condition } = rules[rule];
        if (action.type !== 'show')
          return {
            message: `Rule ${rule + 1} checks an answer that comes after the page it leaves from. Pick an earlier question or a later page.`,
            targetId,
          };
        const shown = numbers.get(action.fieldId) ?? 0;
        const later = conditionFields(condition).find(
          (id) => (numbers.get(id) ?? 0) >= shown,
        );
        if (later)
          return {
            message: `Rule ${rule + 1} shows ${name(action.fieldId)}, which now comes before ${name(later)}. Pick a later question.`,
            targetId,
          };
      }
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
      return {
        message: subject ? `${subject}: ${message}` : message,
        targetId,
      };
    })
    .filter(({ message, targetId }) => {
      const key = `${targetId}:${message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
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
