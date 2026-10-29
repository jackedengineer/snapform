import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import { getResponse, listResponses } from '@snapform/database/responses';
import {
  decodeResponseCursor,
  encodeResponseCursor,
  responseQuerySchema,
  responsePageSchema,
  responseDetailSchema,
} from '@snapform/contracts/responses';
import { createWorkspaceSchema } from '@snapform/contracts/workspace';
const identity = createWorkspaceSchema.shape.id;
type ResponseRoute = { workspaceId: string; formId: string; id?: string };
export function matchResponsesRoute(path: string): ResponseRoute | null {
  const match = path.match(
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/forms\/([A-Fa-f0-9-]{36})\/responses(?:\/([A-Fa-f0-9-]{36}))?$/,
  );
  if (!match) return null;
  const workspace = identity.safeParse(match[1]),
    form = identity.safeParse(match[2]),
    id = match[3] ? identity.safeParse(match[3]) : undefined;
  if (!workspace.success || !form.success || (id && !id.success)) return null;
  return { workspaceId: workspace.data, formId: form.data, id: id?.data };
}
export async function handleResponsesRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: ResponseRoute,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  let cursor;
  try {
    const query = responseQuerySchema.parse(req.query);
    if (route.id && query.cursor) throw Error('INVALID_CURSOR');
    cursor = decodeResponseCursor(query.cursor);
  } catch {
    res.status(422).json({ error: { code: 'INVALID_CURSOR' } });
    return;
  }
  try {
    if (route.id) {
      res.json(
        responseDetailSchema.parse({
          response: await getResponse(
            db,
            actor,
            route.workspaceId,
            route.formId,
            route.id,
          ),
        }),
      );
    } else {
      const page = await listResponses(
        db,
        actor,
        route.workspaceId,
        route.formId,
        cursor,
      );
      res.json(
        responsePageSchema.parse({
          ...page,
          nextCursor: encodeResponseCursor(page.nextCursor),
        }),
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      ['WORKSPACE_NOT_FOUND', 'FORM_NOT_FOUND', 'RESPONSE_NOT_FOUND'].includes(
        error.message,
      )
    ) {
      res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return;
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      res.status(403).json({ error: { code: 'FORBIDDEN' } });
      return;
    }
    throw error;
  }
}
