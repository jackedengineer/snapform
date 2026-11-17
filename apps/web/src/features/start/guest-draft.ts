import { formDefinitionSchema } from '@snapform/contracts/form';
import type { FormDefinition } from '@snapform/contracts/form';
import { can } from '@snapform/contracts/workspace';
import type { CreateWorkspace, Workspace } from '@snapform/contracts/workspace';
import { newBlankDefinition } from '../forms/new-form';
import { newStarterDefinition, type StarterId } from '../forms/starters';

// A form built before signing up lives only in this browser until the person
// has an account; then it becomes their workspace and form. The ids are
// chosen up front so creating them after sign-in can be retried safely.
export type GuestDraft = {
  version: 1;
  formId: string;
  workspaceId: string;
  segment: Workspace['segment'];
  business: string;
  definition: FormDefinition;
  updatedAt: number;
};
export const guestDraftKey = 'snapform:guest-draft';
export const guestDraftLifetime = 7 * 86400000;
const keys = [
  'version',
  'formId',
  'workspaceId',
  'segment',
  'business',
  'definition',
  'updatedAt',
].sort();
const segments = new Set(['agency', 'coach', 'consultant', 'startup']);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newGuestDraft(
  starter: StarterId | 'blank',
  now: number,
): GuestDraft {
  return {
    version: 1,
    formId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    segment: starter === 'blank' ? 'agency' : starter,
    business: '',
    definition:
      starter === 'blank'
        ? newBlankDefinition()
        : newStarterDefinition(starter),
    updatedAt: now,
  };
}

// Storage is the browser's, so everything read back is checked again.
export function readGuestDraft(
  raw: string | null,
  now: number,
): GuestDraft | null {
  let value: unknown;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== keys.join()) return null;
  const { version, formId, workspaceId, segment, business, updatedAt } = record;
  if (
    version !== 1 ||
    typeof formId !== 'string' ||
    !uuid.test(formId) ||
    typeof workspaceId !== 'string' ||
    !uuid.test(workspaceId) ||
    typeof segment !== 'string' ||
    !segments.has(segment) ||
    typeof business !== 'string' ||
    business.length > 80 ||
    typeof updatedAt !== 'number' ||
    updatedAt > now ||
    now - updatedAt >= guestDraftLifetime
  )
    return null;
  const definition = formDefinitionSchema.safeParse(record.definition);
  if (!definition.success) return null;
  return {
    version,
    formId,
    workspaceId,
    segment: segment as Workspace['segment'],
    business,
    definition: definition.data,
    updatedAt,
  };
}

// After sign-in: the business becomes a new workspace, unless the person can
// already edit one, in which case the form joins it.
export function importPlan(
  draft: GuestDraft,
  workspaces: Workspace[],
):
  | { kind: 'existing'; workspaceId: string }
  | { kind: 'create'; workspace: CreateWorkspace } {
  const editable = workspaces.find((workspace) =>
    can(workspace.role, 'forms.write'),
  );
  if (editable) return { kind: 'existing', workspaceId: editable.id };
  const name = draft.business.trim();
  return {
    kind: 'create',
    workspace: {
      id: draft.workspaceId,
      name: [...name].length >= 2 ? name : 'My workspace',
      segment: draft.segment,
    },
  };
}
