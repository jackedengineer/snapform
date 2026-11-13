import { z } from 'zod';
import { email } from './auth.ts';
import { can, roleSchema } from './workspace.ts';
import type { Role } from './workspace.ts';

// Ownership grants billing and deletion, so it is given by promoting an
// existing member deliberately, never by a link that can be forwarded.
export const inviteRoleSchema = z.enum(['editor', 'viewer']);
export const createInvitationSchema = z.strictObject({
  email: z.string().trim().pipe(email),
  role: inviteRoleSchema,
});
export type CreateInvitation = z.infer<typeof createInvitationSchema>;

// 32 random bytes as unpadded base64url: 43 characters, the last carrying
// only 4 bits, so a canonical token ends in one of 16 characters.
export const invitationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
export const invitationHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const acceptInvitationSchema = z.strictObject({
  token: invitationTokenSchema,
});
export function newInvitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export async function hashInvitationToken(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(invitationTokenSchema.parse(token)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
// The link carries the token in its fragment, which browsers never send to a server.
export function invitationTokenFromFragment(fragment: string) {
  const match = /^#token=([^&=#]*)$/.exec(fragment);
  const token = invitationTokenSchema.safeParse(match?.[1]);
  return token.success ? token.data : null;
}

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

export const memberIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const roleChangeSchema = z.strictObject({ role: roleSchema });
const memberSchema = z.strictObject({
  userId: memberIdSchema,
  name: z.string().max(200),
  email: z.string().max(254),
  role: roleSchema,
  joinedAt: z.iso.datetime(),
});
export type Member = z.infer<typeof memberSchema>;
export const teamSchema = z.strictObject({
  role: roleSchema,
  members: z.array(memberSchema).max(200),
});
export type Team = { role: Role; members: Member[] };
const invitationSchema = z.strictObject({
  id: z.uuid(),
  email: z.string().max(254),
  role: inviteRoleSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof invitationSchema>;
export const invitationListSchema = z.strictObject({
  invitations: z.array(invitationSchema).max(200),
});
export const invitationCreatedSchema = z.strictObject({
  invitation: invitationSchema,
  inviteUrl: z.url({ protocol: /^https?$/ }),
  emailSent: z.boolean(),
});
export const invitationAcceptedSchema = z.strictObject({
  workspace: z.strictObject({
    id: z.uuid(),
    name: z.string().max(80),
    role: roleSchema,
  }),
});
export const memberChangedSchema = z.strictObject({
  member: z.strictObject({ userId: memberIdSchema, role: roleSchema }),
});
