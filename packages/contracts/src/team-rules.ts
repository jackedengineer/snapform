import { can, roleSchema } from './workspace.ts';
// Kept free of schemas so screens can explain refusals without loading them.
export type TeamDecision = 'allowed' | 'FORBIDDEN' | 'LAST_OWNER';
// The database repeats these checks under a workspace lock; this copy lets the
// API and screens explain a refusal before asking.
export function roleChangeDecision(
  actor: unknown,
  target: unknown,
  next: unknown,
  owners: number,
): TeamDecision {
  if (
    !can(actor, 'members.manage') ||
    !roleSchema.safeParse(target).success ||
    !roleSchema.safeParse(next).success
  )
    return 'FORBIDDEN';
  return target === 'owner' && next !== 'owner' && owners <= 1
    ? 'LAST_OWNER'
    : 'allowed';
}
export function removalDecision(
  actor: unknown,
  target: unknown,
  owners: number,
): TeamDecision {
  return roleChangeDecision(actor, target, 'viewer', owners);
}
