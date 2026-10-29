import { Router } from 'express';
import type { Request, Response } from 'express';
import { openDatabase } from '@snapform/database';
import { resolvePublicForm } from '@snapform/database/public-form';
import { publicFormEnvelopeSchema } from '@snapform/contracts/public-form';
import { compileDefinition } from '@snapform/contracts/compile';
import { requestScope } from './request-context.ts';
const identity = publicFormEnvelopeSchema.shape.form.shape.publicId;
const pattern = /^\/api\/v1\/public\/forms\/([A-Fa-f0-9-]{36})$/;
export function matchPublicFormRoute(path: string) {
  const match = path.match(pattern);
  if (!match) return null;
  const id = identity.safeParse(match[1]);
  return id.success ? id.data : null;
}
export const publicFormRoutes = Router();
publicFormRoutes.use(async (req, res, next) => {
  const id = matchPublicFormRoute(req.path);
  if (!id) return next();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  const scope = requestScope.getStore();
  if (!scope) throw new Error('Request context is required.');
  const completion = handlePublicForm(req, res, id, scope);
  // Preserve connection cleanup after the Node HTTP bridge sends the response.
  scope.context.waitUntil(
    completion.catch(() => {
      console.error(
        JSON.stringify({
          event: 'public_form_request_failed',
          requestId: res.getHeader('X-Request-Id'),
        }),
      );
    }),
  );
  try {
    await completion;
  } catch {
    if (res.headersSent) res.destroy();
    else next(new Error('Public form request could not be completed.'));
  }
});
async function handlePublicForm(
  req: Request,
  res: Response,
  id: string,
  scope: NonNullable<ReturnType<typeof requestScope.getStore>>,
) {
  const settings = scope.environment;
  const key = req.get('cf-connecting-ip') || 'local';
  if (!(await settings.PUBLIC_READ_RATE_LIMIT.limit({ key })).success) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: { code: 'RATE_LIMITED' } });
    return;
  }
  if (!settings.DATABASE_URL) {
    res.status(503).json({ error: { code: 'FORM_UNAVAILABLE' } });
    return;
  }
  const { db, close } = await openDatabase(settings.DATABASE_URL);
  try {
    const record = await resolvePublicForm(db, id);
    if (!record) {
      res.status(404).json({ error: { code: 'FORM_UNAVAILABLE' } });
      return;
    }
    const compiled = compileDefinition(record.definition);
    if (!compiled.ok) {
      res.status(503).json({ error: { code: 'FORM_UNAVAILABLE' } });
      return;
    }
    // File forms stay unavailable until the real quarantine/scanning slice ships.
    if (
      compiled.definition.pages.some((page) =>
        page.blocks.some((block) => block.type === 'file'),
      )
    ) {
      res.status(503).json({ error: { code: 'FILE_COLLECTION_UNAVAILABLE' } });
      return;
    }
    res.json(
      publicFormEnvelopeSchema.parse({
        form: {
          publicId: record.publicId,
          versionId: record.versionId,
          definition: compiled.definition,
        },
      }),
    );
  } finally {
    await close();
  }
}
