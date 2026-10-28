import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import {
  createForm,
  getForm,
  listForms,
  saveDraft,
} from '@snapform/database/forms';
import {
  createFormSchema,
  saveDraftSchema,
  formCursorSchema,
  formEnvelopeSchema,
  formsPageSchema,
  draftReceiptSchema,
  formsQuerySchema,
} from '@snapform/contracts/draft';
import type { FormCursor } from '@snapform/contracts/draft';
type FormsRoute = { workspaceId: string } & (
  { kind: 'collection' } | { kind: 'draft'; id: string }
);
const identity = createFormSchema.shape.id;
const routePattern =
  /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/forms(?:\/([A-Fa-f0-9-]{36})\/draft)?$/;
export function matchFormsRoute(path: string): FormsRoute | null {
  const match = path.match(routePattern);
  if (!match) return null;
  const workspaceId = identity.safeParse(match[1]);
  if (!workspaceId.success) return null;
  if (!match[2]) return { kind: 'collection', workspaceId: workspaceId.data };
  const id = identity.safeParse(match[2]);
  return id.success
    ? { kind: 'draft', workspaceId: workspaceId.data, id: id.data }
    : null;
}
const statuses = new Map([
  ['WORKSPACE_NOT_FOUND', 404],
  ['FORM_NOT_FOUND', 404],
  ['FORBIDDEN', 403],
  ['FORM_CONFLICT', 409],
  ['DRAFT_CONFLICT', 409],
  ['OPERATION_CONFLICT', 409],
]);
function snapshot(record: Awaited<ReturnType<typeof getForm>>) {
  return formEnvelopeSchema.parse({
    form: { ...record, updatedAt: record.updatedAt.toISOString() },
  });
}
export async function handleFormsRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: FormsRoute,
) {
  const allowed =
    route.kind === 'collection' ? ['GET', 'POST'] : ['GET', 'PUT'];
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  try {
    if (route.kind === 'collection' && req.method === 'GET') {
      const query = formsQuerySchema.safeParse(req.query);
      let cursor: FormCursor | undefined;
      try {
        if (!query.success) throw new Error('Invalid query');
        if (query.data.cursor) {
          const encoded = query.data.cursor
            .replace(/-/g, '+')
            .replace(/_/g, '/');
          cursor = formCursorSchema.parse(
            JSON.parse(
              atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')),
            ),
          );
        }
      } catch {
        res.status(422).json({ error: { code: 'INVALID_CURSOR' } });
        return;
      }
      const page = await listForms(db, actor, route.workspaceId, cursor);
      res.json(
        formsPageSchema.parse({
          ...page,
          forms: page.forms.map((item) => ({
            ...item,
            updatedAt: item.updatedAt.toISOString(),
          })),
          nextCursor: page.nextCursor
            ? btoa(JSON.stringify(page.nextCursor))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '')
            : null,
        }),
      );
    } else if (route.kind === 'collection') {
      const input = createFormSchema.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ error: { code: 'INVALID_FORM' } });
        return;
      }
      res
        .status(201)
        .json(
          snapshot(await createForm(db, actor, route.workspaceId, input.data)),
        );
    } else if (req.method === 'GET') {
      res.json(snapshot(await getForm(db, actor, route.workspaceId, route.id)));
    } else {
      const input = saveDraftSchema.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ error: { code: 'INVALID_DRAFT' } });
        return;
      }
      res.json(
        draftReceiptSchema.parse(
          await saveDraft(db, actor, route.workspaceId, route.id, input.data),
        ),
      );
    }
  } catch (error) {
    const status =
      error instanceof Error ? statuses.get(error.message) : undefined;
    if (!status || !(error instanceof Error)) throw error;
    res.status(status).json({ error: { code: error.message } });
  }
}
