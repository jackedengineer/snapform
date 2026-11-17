import { SELF, createExecutionContext, env } from 'cloudflare:test';
import { httpServerHandler } from 'cloudflare:node';
import { afterAll, beforeEach, expect, it } from 'vitest';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Database } from '@snapform/database';
import {
  handleResponseFiles,
  matchResponseFilesRoute,
} from '../src/response-files.ts';
import { requestScope } from '../src/request-context.ts';
import { sessionCookie } from './session-cookie.ts';

const workspaceId = crypto.randomUUID(),
  formId = crypto.randomUUID(),
  responseId = crypto.randomUUID(),
  fileId = crypto.randomUUID();
const base = `https://snapform.test/api/v1/workspaces/${workspaceId}/forms/${formId}/responses/${responseId}/files`;
const key = `${workspaceId}/${formId}/${responseId}/${'r'.repeat(43)}`;
const bytes = new TextEncoder().encode('%PDF-1.7\n<script>alert(1)</script>\n');

// The real handler, database module and R2 run in workerd; the stub answers
// scope_workspace with a role and the file queries with configured rows.
const dialect = new PgDialect();
let role: 'owner' | 'editor' | 'viewer' | 'none' = 'viewer',
  rows: Record<string, unknown>[] = [],
  queries: string[] = [];
beforeEach(() => {
  role = 'viewer';
  rows = [];
  queries = [];
});
const tx = {
  async execute(query: SQL) {
    const rendered = dialect.sqlToQuery(query);
    queries.push(rendered.sql);
    if (rendered.sql.includes('scope_workspace')) {
      if (role === 'none')
        throw Error('Failed query', { cause: Error('WORKSPACE_NOT_FOUND') });
      return { rows: [{ role, deletion_pending: false }] };
    }
    return { rows };
  },
};
const db = {
  transaction: async (run: (scoped: typeof tx) => Promise<unknown>) => run(tx),
} as unknown as Database;
const app = express();
app.use((req, res, next) => {
  const route = matchResponseFilesRoute(req.path);
  if (!route) return next();
  requestScope
    .run(
      {
        environment: env as never,
        context: createExecutionContext(),
        origin: 'https://snapform.test',
      },
      () => handleResponseFiles(req, res, db, 'user-1', route),
    )
    .catch(next);
});
const errorHandler: ErrorRequestHandler = (_error, _req, res, next) => {
  if (res.headersSent) return next(_error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
};
app.use(errorHandler);
const server = app.listen(3109);
const bridge = httpServerHandler({ port: 3109 }).fetch;
if (!bridge) throw Error('Cloudflare HTTP bridge is required.');
const serve = bridge;
afterAll(() => {
  server.close();
});
const call = (url: string, init: RequestInit = {}) =>
  serve(
    new Request(url, init) as Request<unknown, IncomingRequestCfProperties>,
    {},
    createExecutionContext(),
  );
const stored = {
  object_key: key,
  name: 'Résumé "final".pdf',
  content_type: 'application/pdf',
  size: bytes.length,
};

it('matches only UUID-scoped response file paths', () => {
  const path = new URL(base).pathname;
  expect(matchResponseFilesRoute(path)).toEqual({
    workspaceId,
    formId,
    responseId,
    fileId: undefined,
  });
  expect(matchResponseFilesRoute(`${path}/${fileId}`)?.fileId).toBe(fileId);
  for (const bad of [
    `${path}/..%2F..%2Fkeys`,
    `${path}/${fileId}/raw`,
    path.replace(responseId, 'latest'),
  ])
    expect(matchResponseFilesRoute(bad)).toBeNull();
});
it('requires a signed-in member before any file work', async () => {
  for (const url of [base, `${base}/${fileId}`]) {
    const response = await SELF.fetch(url);
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  const forged = await SELF.fetch(`${base}/${fileId}`, {
    headers: { Cookie: sessionCookie, 'cf-connecting-ip': '198.51.100.250' },
  });
  // A well-formed but unknown session reaches Better Auth, never R2.
  expect([401, 503]).toContain(forged.status);
});
it('downloads as an attachment with nosniff for every member role', async () => {
  await env.UPLOADS.put(key, bytes);
  try {
    for (const member of ['owner', 'editor', 'viewer'] as const) {
      role = member;
      rows = [stored];
      const response = await call(`${base}/${fileId}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Disposition')).toBe(
        `attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf`,
      );
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Content-Type')).toBe('application/pdf');
      expect(response.headers.get('Content-Security-Policy')).toBe(
        "default-src 'none'; sandbox",
      );
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    }
    expect(queries.join('\n')).toContain('from public.response_file f');
  } finally {
    await env.UPLOADS.delete(key);
  }
});
it('hides other workspaces, unknown files and missing objects', async () => {
  role = 'none';
  expect((await call(`${base}/${fileId}`)).status).toBe(404);
  role = 'viewer';
  rows = [];
  const unknown = await call(`${base}/${fileId}`);
  expect(unknown.status).toBe(404);
  expect(await unknown.json()).toEqual({ error: { code: 'FILE_NOT_FOUND' } });
  // A row whose key is not a respondent key is never read from R2.
  rows = [{ ...stored, object_key: '../../intents/x.enc' }];
  expect((await call(`${base}/${fileId}`)).status).toBe(404);
  rows = [stored];
  expect((await call(`${base}/${fileId}`)).status).toBe(404);
});
it('lists metadata without keys and refuses writes and cross-site loads', async () => {
  rows = [
    {
      session_id: responseId,
      id: fileId,
      question_id: crypto.randomUUID(),
      name: 'Brief.pdf',
      size: 10,
      content_type: 'application/pdf',
    },
  ];
  const list = await call(base);
  const body = (await list.json()) as { files: Record<string, unknown>[] };
  expect(body.files).toEqual([
    expect.objectContaining({ id: fileId, name: 'Brief.pdf', size: 10 }),
  ]);
  expect(JSON.stringify(body)).not.toMatch(/key|session/);
  expect((await call(`${base}/${fileId}`, { method: 'DELETE' })).status).toBe(
    405,
  );
  const crossSite = await call(`${base}/${fileId}`, {
    headers: { 'sec-fetch-site': 'cross-site' },
  });
  expect(crossSite.status).toBe(403);
});
