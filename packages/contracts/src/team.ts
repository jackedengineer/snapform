import { z } from './zod.ts';
import { email } from './auth.ts';
import { roleSchema } from './workspace.ts';
import type { Role } from './workspace.ts';
import { invitationTokenPattern } from './invitation-token.ts';
export { invitationTokenFromFragment } from './invitation-token.ts';
export { roleChangeDecision, removalDecision } from './team-rules.ts';

// Ownership grants billing and deletion, so it is given by promoting an
// existing member deliberately, never by a link that can be forwarded.
export const inviteRoleSchema = z.enum(['editor', 'viewer']);
export const createInvitationSchema = z.strictObject({
  email: z.pipe(z.string().check(z.trim()), email),
  role: inviteRoleSchema,
});
export type CreateInvitation = z.infer<typeof createInvitationSchema>;

export const invitationTokenSchema = z
  .string()
  .check(z.regex(invitationTokenPattern));
export const invitationHashSchema = z.string().check(z.regex(/^[0-9a-f]{64}$/));
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
export const memberIdSchema = z
  .string()
  .check(z.regex(/^[A-Za-z0-9_-]{1,64}$/));
export const roleChangeSchema = z.strictObject({ role: roleSchema });
const memberSchema = z.strictObject({
  userId: memberIdSchema,
  name: z.string().check(z.maxLength(200)),
  email: z.string().check(z.maxLength(254)),
  role: roleSchema,
  joinedAt: z.iso.datetime(),
});
export type Member = z.infer<typeof memberSchema>;
export const teamSchema = z.strictObject({
  role: roleSchema,
  members: z.array(memberSchema).check(z.maxLength(200)),
});
export type Team = { role: Role; members: Member[] };
export const invitationIdSchema = z.uuid();
export const invitationSchema = z.strictObject({
  id: invitationIdSchema,
  email: z.string().check(z.maxLength(254)),
  role: inviteRoleSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof invitationSchema>;
export const invitationListSchema = z.strictObject({
  invitations: z.array(invitationSchema).check(z.maxLength(200)),
});
export const invitationCreatedSchema = z.strictObject({
  invitation: invitationSchema,
  inviteUrl: z.url({ protocol: /^https?$/ }),
  emailSent: z.boolean(),
});
export const invitationAcceptedSchema = z.strictObject({
  workspace: z.strictObject({
    id: z.uuid(),
    name: z.string().check(z.maxLength(80)),
    role: roleSchema,
  }),
});
export const memberChangedSchema = z.strictObject({
  member: z.strictObject({ userId: memberIdSchema, role: roleSchema }),
});
