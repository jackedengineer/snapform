import type { Invitation, Member } from '@snapform/contracts/team';
import { removalDecision } from '@snapform/contracts/team-rules';
import { can } from '@snapform/contracts/workspace';
import type { Role } from '@snapform/contracts/workspace';

// The API validates every request; these screens check only what they render.
const messages: Record<string, string> = {
  UNAVAILABLE: 'We couldn’t reach Snapform. Try again.',
  UNAUTHENTICATED: 'Sign in again to continue.',
  FORBIDDEN: 'Only owners can manage the team.',
  INVALID_INVITATION: 'Enter a valid email address.',
  ALREADY_MEMBER: 'They’re already in this workspace.',
  SEAT_LIMIT_REACHED: 'No seats are free.',
  LAST_OWNER: 'Make someone else an owner first.',
  RATE_LIMITED: 'Too many requests. Try again soon.',
  INVITATION_RATE_LIMITED: 'Too many invites today.',
  WORKSPACE_DELETION_PENDING: 'This workspace is being deleted.',
  INVITATION_NOT_FOUND: 'This invite link isn’t valid.',
  INVITATION_EXPIRED: 'This invite has expired. Ask for a new one.',
  INVITATION_REVOKED: 'This invite was withdrawn.',
  INVITATION_USED: 'This invite has already been used.',
  INVITATION_EMAIL_MISMATCH:
    'This invite is for a different email address. Sign in with that address.',
};
export class TeamRequestError extends Error {
  constructor(readonly code: string) {
    super(messages[code] ?? messages.UNAVAILABLE);
  }
}
const fail = (code = 'UNAVAILABLE'): never => {
  throw new TeamRequestError(code);
};
async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  }).catch(() => fail());
  const result: unknown =
    response.status === 204 ? {} : await response.json().catch(() => null);
  const record =
    result && typeof result === 'object'
      ? (result as Record<string, unknown>)
      : null;
  const error = record?.error;
  if (!response.ok)
    fail(
      response.status === 401
        ? 'UNAUTHENTICATED'
        : error &&
            typeof error === 'object' &&
            'code' in error &&
            typeof error.code === 'string'
          ? error.code
          : undefined,
    );
  return record ?? fail();
}
const list = (value: unknown) => (Array.isArray(value) ? value : fail());
const base = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;

export async function fetchTeam(workspaceId: string) {
  const team = await request(`${base(workspaceId)}/members`);
  if (!can(team.role, 'members.read')) fail();
  return { role: team.role as Role, members: list(team.members) as Member[] };
}
export async function fetchInvites(workspaceId: string) {
  const result = await request(`${base(workspaceId)}/invitations`);
  return list(result.invitations) as Invitation[];
}
export async function createInvite(
  workspaceId: string,
  email: string,
  role: 'editor' | 'viewer',
) {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254)
    fail('INVALID_INVITATION');
  const created = await request(`${base(workspaceId)}/invitations`, 'POST', {
    email: address,
    role,
  });
  if (typeof created.inviteUrl !== 'string') fail();
  return {
    email: address,
    url: String(created.inviteUrl),
    emailSent: created.emailSent === true,
  };
}
export const revokeInvite = (workspaceId: string, invitationId: string) =>
  request(
    `${base(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
    'DELETE',
  );
export const changeRole = (workspaceId: string, userId: string, role: Role) =>
  request(
    `${base(workspaceId)}/members/${encodeURIComponent(userId)}`,
    'PATCH',
    {
      role,
    },
  );
export const removeMember = (workspaceId: string, userId: string) =>
  request(
    `${base(workspaceId)}/members/${encodeURIComponent(userId)}`,
    'DELETE',
  );
// The token travels only in this request body, never in a URL.
export async function acceptInvite(token: string) {
  const { workspace } = await request('/api/v1/invitations/accept', 'POST', {
    token,
  });
  const id =
    workspace && typeof workspace === 'object' && 'id' in workspace
      ? workspace.id
      : null;
  return typeof id === 'string' ? id : fail();
}

const day = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
export function expiryLabel(expiresAt: string, now = Date.now()) {
  const expires = Date.parse(expiresAt);
  return expires > now ? `Expires ${day.format(expires)}` : 'Expired';
}
// The API and database decide; this only hides controls that would be refused.
export function memberControls(
  viewer: Role,
  member: { role: Role },
  owners: number,
) {
  const manage = viewer === 'owner';
  return {
    manage,
    lastOwner:
      manage && removalDecision(viewer, member.role, owners) === 'LAST_OWNER',
  };
}
// Shown when the API refuses an invite with SEAT_LIMIT_REACHED. Pro is the
// largest plan, so only Free is offered an upgrade.
export function seatNotice(plan?: { plan: 'free' | 'pro'; seatLimit: number }) {
  if (!plan)
    return { text: 'Every seat on your plan is in use.', upgrade: true };
  const seats = `${plan.seatLimit} ${plan.seatLimit === 1 ? 'seat' : 'seats'}`;
  return plan.plan === 'free'
    ? { text: `Your plan includes ${seats}.`, upgrade: true }
    : {
        text: `Your plan includes ${seats}. Revoke an invite or remove someone to free a seat.`,
        upgrade: false,
      };
}
export const roleHelp: Record<Role, string> = {
  owner: 'Manages the team, billing and deletion.',
  editor: 'Builds forms and reads every response.',
  viewer: 'Reads every response, including sensitive answers.',
};
