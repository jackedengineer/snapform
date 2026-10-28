import { localDraftSchema } from '@snapform/contracts/draft';
import type { LocalDraft } from '@snapform/contracts/draft';
export type DraftScope = Pick<LocalDraft, 'userId' | 'workspaceId' | 'formId'>;
export const draftLifetime = 7 * 86400000;
export function localDraftKey(value: DraftScope & { editorId: string }) {
  return JSON.stringify([
    value.userId,
    value.workspaceId,
    value.formId,
    value.editorId,
  ]);
}
export function readLocalDraft(
  input: unknown,
  scope: DraftScope,
  now: number,
): LocalDraft | null {
  const parsed = localDraftSchema.safeParse(input);
  if (!parsed.success) return null;
  const value = parsed.data;
  if (
    value.userId !== scope.userId ||
    value.workspaceId !== scope.workspaceId ||
    value.formId !== scope.formId ||
    value.updatedAt > now ||
    now - value.updatedAt >= draftLifetime
  )
    return null;
  return value;
}
