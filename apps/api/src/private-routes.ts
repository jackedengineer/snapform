import { json } from 'express';
import type { Request, Response, RequestHandler } from 'express';
import type { Database } from '@snapform/database';
import { handleWorkspaceRequest, workspacePath } from './workspaces.ts';

export function isPrivatePath(path: string) {
  return path === '/api/v1/me' || path === workspacePath;
}
const workspaceBody = json({ limit: 16384, strict: true, inflate: false });
export const privateBody: RequestHandler = (req, res, next) => {
  if (req.path !== workspacePath || req.method !== 'POST') return next();
  if (!req.is('application/json')) {
    res.status(415).json({ error: { code: 'JSON_REQUIRED' } });
    return;
  }
  workspaceBody(req, res, next);
};
export async function handlePrivateRequest(
  req: Request,
  res: Response,
  db: Database,
  user: { id: string; name: string; email: string },
) {
  if (req.path === '/api/v1/me') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    } else res.json({ user });
  } else if (req.path === workspacePath) {
    await handleWorkspaceRequest(req, res, db, user.id);
  } else res.status(404).json({ error: { code: 'NOT_FOUND' } });
}
