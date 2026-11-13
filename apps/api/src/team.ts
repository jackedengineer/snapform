import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  listInvitations,
  listTeam,
  noSeatLimit,
  removeMember,
  revokeInvitation,
} from '@snapform/database/team';
import type { SeatLimit } from '@snapform/database/team';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  hashInvitationToken,
  invitationIdSchema,
  memberIdSchema,
  newInvitationToken,
  roleChangeSchema,
} from '@snapform/contracts/team';
import { createWorkspaceSchema } from '@snapform/contracts/workspace';
import type { InviteMessage } from './email.ts';

// Billing plugs in here: replace with a lookup of the workspace plan's seats
// (Free 1, Pro 3). It runs inside the invitation transaction after the owner
// check and workspace lock. Until entitlements exist, invites are unlimited.
const seatLimit: SeatLimit = noSeatLimit;

export const acceptPath = '/api/v1/invitations/accept';
export type TeamRoute =
  | { kind: 'invitations'; workspaceId: string }
  | { kind: 'invitation'; workspaceId: string; invitationId: string }
  | { kind: 'members'; workspaceId: string }
  | { kind: 'member'; workspaceId: string; userId: string }
  | { kind: 'accept' };
export function matchTeamRoute(path: string): TeamRoute | null {
  if (path === acceptPath) return { kind: 'accept' };
  const match =
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/(invitations|members)(?:\/([^/]+))?$/.exec(
      path,
    );
  const workspace = createWorkspaceSchema.shape.id.safeParse(match?.[1]);
  if (!match || !workspace.success) return null;
  const workspaceId = workspace.data;
  if (match[3] === undefined)
    return match[2] === 'members'
      ? { kind: 'members', workspaceId }
      : { kind: 'invitations', workspaceId };
  if (match[2] === 'members') {
    const userId = memberIdSchema.safeParse(match[3]);
    return userId.success
      ? { kind: 'member', workspaceId, userId: userId.data }
      : null;
  }
  const invitationId = invitationIdSchema.safeParse(match[3]);
  return invitationId.success
    ? {
        kind: 'invitation',
        workspaceId,
        invitationId: invitationId.data.toLowerCase(),
      }
    : null;
}
export function isTeamWrite(req: Request) {
  const route = matchTeamRoute(req.path);
  return (
    (route?.kind === 'invitations' && req.method === 'POST') ||
    (route?.kind === 'accept' && req.method === 'POST') ||
    (route?.kind === 'member' && req.method === 'PATCH')
  );
}
const methods: Record<TeamRoute['kind'], string[]> = {
  invitations: ['GET', 'POST'],
  invitation: ['DELETE'],
  members: ['GET'],
  member: ['PATCH', 'DELETE'],
  accept: ['POST'],
};
const statuses: Record<string, number> = {
  WORKSPACE_NOT_FOUND: 404,
  MEMBER_NOT_FOUND: 404,
  INVITATION_NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVITATION_EMAIL_MISMATCH: 403,
  EMAIL_NOT_VERIFIED: 403,
  WORKSPACE_DELETION_PENDING: 409,
  ALREADY_MEMBER: 409,
  SEAT_LIMIT_REACHED: 409,
  INVITATION_CONFLICT: 409,
  LAST_OWNER: 409,
  INVITATION_USED: 410,
  INVITATION_REVOKED: 410,
  INVITATION_EXPIRED: 410,
  INVITATION_RATE_LIMITED: 429,
};
export type InviteServices = {
  origin: string;
  // Per-account limit on sending and accepting invites.
  allowed: () => Promise<boolean>;
  send: (message: InviteMessage) => Promise<boolean>;
};
export async function handleTeamRequest(
  req: Request,
  res: Response,
  db: Database,
  user: { id: string; name: string },
  route: TeamRoute,
  services: InviteServices,
) {
  const allowed = methods[route.kind];
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  // Tokens and addresses belong in bodies, never in logged URLs.
  if (Object.keys(req.query).length) {
    res.status(422).json({
      error: {
        code: route.kind === 'member' ? 'INVALID_ROLE' : 'INVALID_INVITATION',
      },
    });
    return;
  }
  try {
    await respond(req, res, db, user, route, services);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = statuses[code];
    if (!status) throw error;
    if (status === 429) res.setHeader('Retry-After', '3600');
    res.status(status).json({
      error: {
        code: status === 404 && route.kind !== 'accept' ? 'NOT_FOUND' : code,
      },
    });
  }
}
async function respond(
  req: Request,
  res: Response,
  db: Database,
  user: { id: string; name: string },
  route: TeamRoute,
  services: InviteServices,
) {
  if (route.kind === 'accept') {
    const input = acceptInvitationSchema.safeParse(req.body);
    if (!input.success) return invalid(res, 'INVALID_INVITATION');
    if (!(await services.allowed())) return limited(res);
    const hash = await hashInvitationToken(input.data.token);
    res.json({ workspace: await acceptInvitation(db, user.id, hash) });
  } else if (route.kind === 'members') {
    res.json(await listTeam(db, user.id, route.workspaceId));
  } else if (route.kind === 'member' && req.method === 'PATCH') {
    const input = roleChangeSchema.safeParse(req.body);
    if (!input.success) return invalid(res, 'INVALID_ROLE');
    const member = await changeMemberRole(
      db,
      user.id,
      route.workspaceId,
      route.userId,
      input.data,
    );
    res.json({ member });
  } else if (route.kind === 'member') {
    await removeMember(db, user.id, route.workspaceId, route.userId);
    res.status(204).end();
  } else if (route.kind === 'invitation') {
    await revokeInvitation(db, user.id, route.workspaceId, route.invitationId);
    res.status(204).end();
  } else if (req.method === 'GET') {
    res.json(await listInvitations(db, user.id, route.workspaceId));
  } else {
    const input = createInvitationSchema.safeParse(req.body);
    if (!input.success) return invalid(res, 'INVALID_INVITATION');
    if (!(await services.allowed())) return limited(res);
    const token = newInvitationToken();
    const { invitation, workspaceName } = await createInvitation(
      db,
      user.id,
      route.workspaceId,
      input.data,
      await hashInvitationToken(token),
      seatLimit,
    );
    const link = new URL('/invite', services.origin);
    link.hash = `token=${token}`;
    const inviteUrl = link.href;
    let emailSent = false;
    try {
      emailSent = await services.send({
        id: invitation.id,
        to: invitation.email,
        inviter: user.name,
        workspace: workspaceName,
        role: invitation.role,
        url: inviteUrl,
      });
    } catch {
      // The invite stands; the owner shares the one-time link instead.
      console.error(JSON.stringify({ event: 'invite_email_failed' }));
    }
    // The only time the plaintext link leaves the server is this response.
    res.status(201).json({ invitation, inviteUrl, emailSent });
  }
}
function invalid(res: Response, code: string) {
  res.status(422).json({ error: { code } });
}
function limited(res: Response) {
  res.setHeader('Retry-After', '60');
  res.status(429).json({ error: { code: 'RATE_LIMITED' } });
}
