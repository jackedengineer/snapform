import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import {
  getPublication,
  publishForm,
  unpublishForm,
} from '@snapform/database/publication';
import {
  publishFormSchema,
  unpublishFormSchema,
  publicationEnvelopeSchema,
  publicationReceiptSchema,
} from '@snapform/contracts/publication';
const identity = publishFormSchema.shape.versionId;
const pattern =
  /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/forms\/([A-Fa-f0-9-]{36})\/publication$/;
export function matchPublicationRoute(path: string) {
  const match = path.match(pattern);
  if (!match) return null;
  const workspaceId = identity.safeParse(match[1]),
    formId = identity.safeParse(match[2]);
  return workspaceId.success && formId.success
    ? { workspaceId: workspaceId.data, formId: formId.data }
    : null;
}
const statuses = new Map([
  ['WORKSPACE_DELETION_PENDING', 409],
  ['WORKSPACE_NOT_FOUND', 404],
  ['FORM_NOT_FOUND', 404],
  ['PUBLICATION_NOT_FOUND', 404],
  ['FORBIDDEN', 403],
  ['OPERATION_CONFLICT', 409],
  ['DRAFT_CONFLICT', 409],
  ['PUBLICATION_CONFLICT', 409],
  ['PUBLICATION_LIMIT', 409],
  ['INVALID_PUBLICATION', 422],
]);
function serialize(publication: Awaited<ReturnType<typeof getPublication>>) {
  return publication
    ? { ...publication, updatedAt: publication.updatedAt.toISOString() }
    : null;
}
export async function handlePublicationRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: NonNullable<ReturnType<typeof matchPublicationRoute>>,
) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  try {
    if (req.method === 'GET') {
      res.json(
        publicationEnvelopeSchema.parse({
          publication: serialize(
            await getPublication(db, actor, route.workspaceId, route.formId),
          ),
        }),
      );
    } else if (req.method === 'POST') {
      const input = publishFormSchema.safeParse(req.body);
      if (!input.success) {
        res
          .status(422)
          .json({ error: { code: 'INVALID_PUBLICATION_REQUEST' } });
        return;
      }
      const receipt = await publishForm(
        db,
        actor,
        route.workspaceId,
        route.formId,
        input.data,
      );
      res.json(
        publicationReceiptSchema.parse({
          ...receipt,
          publication: serialize(receipt.publication),
        }),
      );
    } else {
      const input = unpublishFormSchema.safeParse(req.body);
      if (!input.success) {
        res
          .status(422)
          .json({ error: { code: 'INVALID_PUBLICATION_REQUEST' } });
        return;
      }
      const publication = await unpublishForm(
        db,
        actor,
        route.workspaceId,
        route.formId,
        input.data,
      );
      res.json(
        publicationEnvelopeSchema.parse({
          publication: serialize(publication),
        }),
      );
    }
  } catch (error) {
    const status =
      error instanceof Error ? statuses.get(error.message) : undefined;
    if (!status || !(error instanceof Error)) throw error;
    res.status(status).json({ error: { code: error.message } });
  }
}
