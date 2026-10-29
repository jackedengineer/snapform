import { Buffer } from 'node:buffer';
import { publishFormSchema } from '@snapform/contracts/publication';
import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import { getResponseExport } from '@snapform/database/response-export';
import { createResponseCsv } from '@snapform/contracts/response-csv';
import { requestScope } from './request-context.ts';
const querySchema = publishFormSchema.pick({ versionId: true });
const identity = querySchema.shape.versionId;
type ExportRoute = { workspaceId: string; formId: string };
export function matchResponseExportRoute(path: string): ExportRoute | null {
  const match = path.match(
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/forms\/([A-Fa-f0-9-]{36})\/response-export$/,
  );
  if (!match) return null;
  const workspaceId = identity.safeParse(match[1]),
    formId = identity.safeParse(match[2]);
  return workspaceId.success && formId.success
    ? { workspaceId: workspaceId.data, formId: formId.data }
    : null;
}
export async function handleResponseExport(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: ExportRoute,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  const scope = requestScope.getStore();
  if (!scope) throw Error('Request scope required');
  if (
    req.get('sec-fetch-site') === 'cross-site' ||
    (req.get('Origin') && req.get('Origin') !== scope.origin)
  ) {
    res.status(403).json({ error: { code: 'ORIGIN_REJECTED' } });
    return;
  }
  const input = querySchema.safeParse(req.query);
  if (!input.success) {
    res.status(422).json({ error: { code: 'INVALID_EXPORT' } });
    return;
  }
  if (
    !(await scope.environment.EXPORT_RATE_LIMIT.limit({ key: actor })).success
  ) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: { code: 'RATE_LIMITED' } });
    return;
  }
  try {
    const exported = await getResponseExport(
      db,
      actor,
      route.workspaceId,
      route.formId,
      input.data.versionId,
    );
    const csv = createResponseCsv(
      exported.definition,
      exported.version,
      exported.rows,
    );
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(csv)),
        'Content-Disposition': `attachment; filename="snapform-${route.formId}-v${exported.version}.csv"`,
        'Cross-Origin-Resource-Policy': 'same-origin',
      })
      .end(csv);
    console.log(
      JSON.stringify({
        event: 'response_export_created',
        count: exported.rows.length,
        requestId: res.getHeader('X-Request-Id'),
      }),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status =
      code === 'FORBIDDEN'
        ? 403
        : ['WORKSPACE_NOT_FOUND', 'VERSION_NOT_FOUND'].includes(code)
          ? 404
          : code === 'EXPORT_TOO_LARGE'
            ? 422
            : code === 'EXPORT_CHANGED'
              ? 409
              : undefined;
    if (!status) throw error;
    res.status(status).json({ error: { code } });
  }
}
