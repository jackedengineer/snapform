import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import {
  scheduleDeletion,
  readDeletion,
  findDeletion,
  cancelDeletion,
} from '@snapform/database/deletion';
import {
  deletionRequestSchema,
  deletionTargetSchema,
  scheduleDeletionSchema,
  cancelDeletionSchema,
} from '@snapform/contracts/deletion';
type DeletionRoute = { workspaceId: string } & (
  { kind: 'collection' } | { kind: 'receipt' | 'cancel'; id: string }
);
const identity = deletionTargetSchema.shape.targetId;
export function matchDeletionRoute(path: string): DeletionRoute | null {
  const match = path.match(
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/deletions(?:\/([A-Fa-f0-9-]{36})(\/cancel)?)?$/,
  );
  if (!match) return null;
  const workspace = identity.safeParse(match[1]);
  if (!workspace.success) return null;
  if (!match[2]) return { workspaceId: workspace.data, kind: 'collection' };
  const request = identity.safeParse(match[2]);
  return request.success
    ? {
        workspaceId: workspace.data,
        kind: match[3] ? 'cancel' : 'receipt',
        id: request.data,
      }
    : null;
}
export async function handleDeletionRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: DeletionRoute,
) {
  const allowed =
    route.kind === 'collection'
      ? ['GET', 'POST']
      : route.kind === 'cancel'
        ? ['POST']
        : ['GET'];
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  if (
    !(route.kind === 'collection' && req.method === 'GET') &&
    Object.keys(req.query).length
  ) {
    res.status(422).json({ error: { code: 'INVALID_DELETION' } });
    return;
  }
  try {
    let deletion;
    if (route.kind === 'collection' && req.method === 'GET') {
      const target = deletionTargetSchema.safeParse(req.query);
      if (!target.success) {
        res.status(422).json({ error: { code: 'INVALID_DELETION' } });
        return;
      }
      deletion = await findDeletion(db, actor, route.workspaceId, target.data);
    } else if (route.kind === 'collection') {
      const input = scheduleDeletionSchema.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ error: { code: 'INVALID_DELETION' } });
        return;
      }
      const { kind, targetId, ...confirmation } = input.data;
      deletion = await scheduleDeletion(
        db,
        actor,
        route.workspaceId,
        { kind, targetId },
        confirmation,
      );
    } else if (route.kind === 'cancel') {
      const input = cancelDeletionSchema.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ error: { code: 'INVALID_DELETION' } });
        return;
      }
      deletion = await cancelDeletion(
        db,
        actor,
        route.workspaceId,
        route.id,
        input.data,
      );
    } else {
      deletion = await readDeletion(db, actor, route.workspaceId, route.id);
    }
    res
      .status(route.kind === 'collection' && req.method === 'POST' ? 202 : 200)
      .json({
        deletion:
          deletion === null ? null : deletionRequestSchema.parse(deletion),
      });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status =
      code === 'FORBIDDEN'
        ? 403
        : [
              'WORKSPACE_NOT_FOUND',
              'RESPONSE_NOT_FOUND',
              'DELETION_NOT_FOUND',
            ].includes(code)
          ? 404
          : ['DELETION_CONFLICT', 'WORKSPACE_DELETION_PENDING'].includes(code)
            ? 409
            : [
                  'INVALID_DELETION_CONFIRMATION',
                  'INVALID_DELETION_TARGET',
                ].includes(code)
              ? 422
              : undefined;
    if (!status) throw error;
    res.status(status).json({ error: { code } });
  }
}
