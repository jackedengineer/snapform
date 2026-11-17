import { z } from './zod.ts';
import { isStorableText } from './text.ts';
export const roleSchema = z.enum(['owner', 'editor', 'viewer']);
export type Role = z.infer<typeof roleSchema>;
const permissions = {
  'responses.read': ['owner', 'editor', 'viewer'],
  'forms.write': ['owner', 'editor'],
  'responses.export': ['owner', 'editor'],
  'integrations.manage': ['owner', 'editor'],
  'integrations.read': ['owner', 'editor'],
  'members.read': ['owner', 'editor', 'viewer'],
  'members.manage': ['owner'],
  'billing.manage': ['owner'],
  'workspace.delete': ['owner'],
} satisfies Record<string, Role[]>;
export type Capability = keyof typeof permissions;
export function can(role: unknown, action: unknown): boolean {
  return (
    roleSchema.safeParse(role).success &&
    typeof action === 'string' &&
    Object.hasOwn(permissions, action) &&
    permissions[action as Capability].some((allowed) => allowed === role)
  );
}
export const createWorkspaceSchema = z.strictObject({
  id: z.pipe(
    z.uuid(),
    z.transform((value: string) => value.toLowerCase()),
  ),
  name: z.string().check(
    z.trim(),
    z.minLength(2, 'Use at least two characters.'),
    z.maxLength(80, 'Use no more than 80 characters.'),
    z.refine(isStorableText, 'Use valid text characters.'),
    z.refine((value) => [...value].length >= 2, 'Use at least two characters.'),
  ),
  segment: z.enum(['agency', 'coach', 'consultant', 'startup']),
});
export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;
export const workspaceSchema = z.extend(createWorkspaceSchema, {
  role: roleSchema,
});
export const workspaceListSchema = z.strictObject({
  workspaces: z.array(workspaceSchema).check(z.maxLength(100)),
});
export const workspaceCreatedSchema = z.strictObject({
  workspace: workspaceSchema,
});
export type Workspace = z.infer<typeof workspaceSchema>;
