import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import { createWorkspace, listWorkspaces } from '@snapform/database/workspaces';
import { createWorkspaceSchema } from '@snapform/contracts/workspace';

export const workspacePath = '/api/v1/workspaces';
export async function handleWorkspaceRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
) {
  if (req.method === 'GET') {
    res.json({ workspaces: await listWorkspaces(db, actor) });
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  const input = createWorkspaceSchema.safeParse(req.body);
  if (!input.success) {
    res.status(422).json({ error: { code: 'INVALID_WORKSPACE' } });
    return;
  }
  try {
    res
      .status(201)
      .json({ workspace: await createWorkspace(db, actor, input.data) });
  } catch (error) {
    if (error instanceof Error && error.message === 'WORKSPACE_CONFLICT') {
      res.status(409).json({ error: { code: 'WORKSPACE_CONFLICT' } });
      return;
    }
    throw error;
  }
}
