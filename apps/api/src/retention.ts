import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import {
  getWorkspaceRetention,
  saveWorkspaceRetention,
} from '@snapform/database/retention';
import {
  retentionInputSchema,
  retentionSettingsSchema,
} from '@snapform/contracts/retention';
const identity = retentionSettingsSchema.shape.workspaceId;
export function matchRetentionRoute(path: string) {
  const match = path.match(
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/retention$/,
  );
  const parsed = identity.safeParse(match?.[1]);
  return parsed.success ? { workspaceId: parsed.data } : null;
}
export async function handleRetentionRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: { workspaceId: string },
) {
  if (!['GET', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  if (Object.keys(req.query).length) {
    res.status(422).json({ error: { code: 'INVALID_RETENTION_SETTINGS' } });
    return;
  }
  const input =
    req.method === 'PUT' ? retentionInputSchema.safeParse(req.body) : undefined;
  if (input && !input.success) {
    res.status(422).json({ error: { code: 'INVALID_RETENTION_SETTINGS' } });
    return;
  }
  try {
    const result = input?.success
      ? await saveWorkspaceRetention(db, actor, route.workspaceId, input.data)
      : await getWorkspaceRetention(db, actor, route.workspaceId);
    res.json(retentionSettingsSchema.parse(result));
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status =
      code === 'FORBIDDEN'
        ? 403
        : code === 'RETENTION_CONFLICT'
          ? 409
          : code === 'WORKSPACE_NOT_FOUND'
            ? 404
            : undefined;
    if (!status) throw error;
    res
      .status(status)
      .json({ error: { code: status === 404 ? 'NOT_FOUND' : code } });
  }
}
