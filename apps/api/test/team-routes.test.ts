import { SELF, createExecutionContext } from 'cloudflare:test';
import { httpServerHandler } from 'cloudflare:node';
import { afterAll, beforeEach, expect, it } from 'vitest';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Database } from '@snapform/database';
import { hashInvitationToken } from '@snapform/contracts/team';
import { handleTeamRequest, matchTeamRoute } from '../src/team.ts';
import type { InviteMessage } from '../src/email.ts';

const workspace = crypto.randomUUID(),
  invitation = crypto.randomUUID(),
  base = `https://snapform.test/api/v1/workspaces/${workspace}`,
  accept = 'https://snapform.test/api/v1/invitations/accept',
  token = 'A'.repeat(42) + 'Q';
const routes = [
  ['POST', `${base}/invitations`, { email: 'new@example.com', role: 'viewer' }],
  ['GET', `${base}/invitations`],
  ['DELETE', `${base}/invitations/${invitation}`],
  ['GET', `${base}/members`],
  ['PATCH', `${base}/members/user-2`, { role: 'editor' }],
  ['DELETE', `${base}/members/user-2`],
  ['POST', accept, { token }],
] as const;

// Forged cookies reach Better Auth, which needs the database; the shared
// resource-route tests cover that path when credentials are configured.
it('requires a session on every team route', async () => {
  for (const [method, url, body] of routes) {
    const response = await SELF.fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
  }
});
it('bounds team bodies and blocks cross-origin writes before database work', async () => {
  for (const url of [`${base}/invitations`, accept]) {
    expect((await SELF.fetch(url, { method: 'POST', body: 'x' })).status).toBe(
      415,
    );
    const oversized = await SELF.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'x'.repeat(20000) }),
    });
    expect(oversized.status).toBe(413);
    const forged = await SELF.fetch(url, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.test',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(forged.status).toBe(403);
  }
  expect(matchTeamRoute(`/api/v1/workspaces/${workspace}/members/..%2Fx`)).toBe(
    null,
  );
  expect(matchTeamRoute(`/api/v1/workspaces/not-a-uuid/members`)).toBe(null);
});

// The real handlers and database module run in workerd. The database stub
// stands in only for Postgres: it answers scope_workspace with a role and the
// migration 0042 functions with a configured result.
const dialect = new PgDialect();
type Outcome = { rows: Record<string, unknown>[] } | { raise: string };
let role: 'owner' | 'editor' | 'viewer' | 'none' = 'owner',
  outcome: Outcome = { rows: [] },
  queries: { sql: string; params: unknown[] }[] = [],
  mail: InviteMessage[] = [],
  mailFails = false,
  allowed = true;
beforeEach(() => {
  role = 'owner';
  outcome = { rows: [] };
  queries = [];
  mail = [];
  mailFails = false;
  allowed = true;
});
const failure = (code: string) => Error('Failed query', { cause: Error(code) });
const tx = {
  async execute(query: SQL) {
    const rendered = dialect.sqlToQuery(query);
    queries.push(rendered);
    if (rendered.sql.includes('scope_workspace')) {
      if (role === 'none') throw failure('WORKSPACE_NOT_FOUND');
      return { rows: [{ role, deletion_pending: false }] };
    }
    if (rendered.sql.includes('set_config')) return { rows: [] };
    if ('raise' in outcome) throw failure(outcome.raise);
    return outcome;
  },
};
const db = {
  transaction: async (run: (scoped: typeof tx) => Promise<unknown>) => run(tx),
} as unknown as Database;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const route = matchTeamRoute(req.path);
  if (!route) return next();
  handleTeamRequest(
    req,
    res,
    db,
    { id: 'user-1', name: 'Casey Owner' },
    route,
    {
      origin: 'https://snapform.test',
      allowed: async () => allowed,
      send: async (message) => {
        if (mailFails) throw Error('Provider unavailable');
        mail.push(message);
        return true;
      },
    },
  ).catch(next);
});
const errorHandler: ErrorRequestHandler = (_error, _req, res, next) => {
  if (res.headersSent) return next(_error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
};
app.use(errorHandler);
const server = app.listen(3107);
const bridge = httpServerHandler({ port: 3107 }).fetch;
if (!bridge) throw Error('Cloudflare HTTP bridge is required.');
const serve = bridge;
afterAll(() => {
  server.close();
});
async function call(method: string, url: string, body?: unknown) {
  const text = body === undefined ? undefined : JSON.stringify(body);
  const response = await serve(
    new Request(url, {
      method,
      headers: text
        ? {
            'Content-Type': 'application/json',
            'Content-Length': String(new TextEncoder().encode(text).length),
          }
        : {},
      body: text,
    }) as Request<unknown, IncomingRequestCfProperties>,
    {},
    createExecutionContext(),
  );
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
}
const teamFunctions =
  /workspace_invitation|member_role|workspace_member|from public\.membership/;

it('hides the workspace from non-members and refuses editors and viewers', async () => {
  for (const [method, url, body] of routes.slice(0, 6)) {
    role = 'none';
    expect(await call(method, url, body)).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND' } },
    });
    if (url.endsWith('/members') && method === 'GET') continue;
    for (const member of ['editor', 'viewer'] as const) {
      role = member;
      expect(await call(method, url, body)).toEqual({
        status: 403,
        body: { error: { code: 'FORBIDDEN' } },
      });
    }
  }
  expect(queries.some((query) => teamFunctions.test(query.sql))).toBe(false);
});
it('shows every member the team list', async () => {
  role = 'viewer';
  outcome = {
    rows: [
      {
        user_id: 'user-1',
        name: 'Casey Owner',
        email: 'owner@example.com',
        role: 'owner',
        created_at: new Date('2026-11-01T10:00:00Z'),
      },
    ],
  };
  expect(await call('GET', `${base}/members`)).toEqual({
    status: 200,
    body: {
      role: 'viewer',
      members: [
        {
          userId: 'user-1',
          name: 'Casey Owner',
          email: 'owner@example.com',
          role: 'owner',
          joinedAt: '2026-11-01T10:00:00.000Z',
        },
      ],
    },
  });
});
it('creates an invite, stores only the token hash and returns the link once', async () => {
  outcome = {
    rows: [
      {
        invitation: {
          id: invitation,
          email: 'new@example.com',
          role: 'viewer',
          createdAt: '2026-11-13T10:00:00.123456+00:00',
          expiresAt: '2026-11-20T10:00:00.123456+00:00',
          workspaceName: 'Studio <QA>',
        },
      },
    ],
  };
  const created = await call('POST', `${base}/invitations`, {
    email: ' New@Example.com ',
    role: 'viewer',
  });
  expect(created.status).toBe(201);
  const { inviteUrl } = created.body as { inviteUrl: string };
  const link = new URL(inviteUrl);
  expect(link.origin + link.pathname + link.search).toBe(
    'https://snapform.test/invite',
  );
  const sent = /^#token=([A-Za-z0-9_-]{43})$/.exec(link.hash)?.[1] ?? '';
  expect(sent).not.toBe('');
  expect(created.body).toEqual({
    invitation: {
      id: invitation,
      email: 'new@example.com',
      role: 'viewer',
      createdAt: '2026-11-13T10:00:00.123Z',
      expiresAt: '2026-11-20T10:00:00.123Z',
    },
    inviteUrl,
    emailSent: true,
  });
  const stored = queries.find((query) =>
    query.sql.includes('create_workspace_invitation'),
  );
  expect(stored?.params).toEqual([
    workspace,
    'new@example.com',
    'viewer',
    await hashInvitationToken(sent),
    null,
  ]);
  expect(JSON.stringify(queries)).not.toContain(sent);
  expect(mail).toEqual([
    {
      id: invitation,
      to: 'new@example.com',
      inviter: 'Casey Owner',
      workspace: 'Studio <QA>',
      role: 'viewer',
      url: inviteUrl,
    },
  ]);
});
it('keeps an invite usable by link when its email cannot be sent', async () => {
  outcome = {
    rows: [
      {
        invitation: {
          id: invitation,
          email: 'new@example.com',
          role: 'editor',
          createdAt: '2026-11-13T10:00:00Z',
          expiresAt: '2026-11-20T10:00:00Z',
          workspaceName: 'Studio',
        },
      },
    ],
  };
  mailFails = true;
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => logged.push(...values);
  try {
    const created = await call('POST', `${base}/invitations`, {
      email: 'new@example.com',
      role: 'editor',
    });
    expect(created).toMatchObject({ status: 201, body: { emailSent: false } });
    const { inviteUrl } = created.body as { inviteUrl: string };
    expect(logged).toEqual([JSON.stringify({ event: 'invite_email_failed' })]);
    expect(JSON.stringify(logged)).not.toContain(new URL(inviteUrl).hash);
    expect(JSON.stringify(logged)).not.toContain('new@example.com');
  } finally {
    console.error = original;
  }
});
it('rejects owner invites, unknown keys and tokens outside the body', async () => {
  for (const body of [
    { email: 'new@example.com', role: 'owner' },
    { email: 'new@example.com', role: 'viewer', workspaceId: workspace },
    { email: 'not-an-address', role: 'viewer' },
  ])
    expect(await call('POST', `${base}/invitations`, body)).toEqual({
      status: 422,
      body: { error: { code: 'INVALID_INVITATION' } },
    });
  for (const [url, body] of [
    [accept, { token: token.slice(1) }],
    [accept, { token: token.slice(0, 42) + 'B' }],
    [accept, { token, email: 'owner@example.com' }],
    [`${accept}?token=${token}`, { token }],
  ] as const)
    expect(await call('POST', url, body)).toEqual({
      status: 422,
      body: { error: { code: 'INVALID_INVITATION' } },
    });
  expect(queries).toEqual([]);
});
it('maps forged, expired, reused, revoked and misdirected tokens', async () => {
  for (const [raise, status] of [
    ['INVITATION_NOT_FOUND', 404],
    ['INVITATION_EXPIRED', 410],
    ['INVITATION_USED', 410],
    ['INVITATION_REVOKED', 410],
    ['INVITATION_EMAIL_MISMATCH', 403],
    ['EMAIL_NOT_VERIFIED', 403],
    ['WORKSPACE_DELETION_PENDING', 409],
  ] as const) {
    outcome = { raise };
    expect(await call('POST', accept, { token })).toEqual({
      status,
      body: { error: { code: raise } },
    });
  }
  const accepted = queries.filter((query) =>
    query.sql.includes('accept_workspace_invitation'),
  );
  expect(accepted).toHaveLength(7);
  for (const query of accepted)
    expect(query.params).toEqual([await hashInvitationToken(token)]);
  expect(JSON.stringify(queries)).not.toContain(token);
  outcome = {
    rows: [{ workspace: { id: workspace, name: 'Studio', role: 'viewer' } }],
  };
  expect(await call('POST', accept, { token })).toEqual({
    status: 200,
    body: { workspace: { id: workspace, name: 'Studio', role: 'viewer' } },
  });
});
it('protects the last owner and reports member changes', async () => {
  outcome = { raise: 'LAST_OWNER' };
  expect(
    await call('PATCH', `${base}/members/user-1`, { role: 'editor' }),
  ).toEqual({ status: 409, body: { error: { code: 'LAST_OWNER' } } });
  expect(await call('DELETE', `${base}/members/user-1`)).toEqual({
    status: 409,
    body: { error: { code: 'LAST_OWNER' } },
  });
  outcome = { raise: 'MEMBER_NOT_FOUND' };
  expect(await call('DELETE', `${base}/members/user-9`)).toEqual({
    status: 404,
    body: { error: { code: 'NOT_FOUND' } },
  });
  expect(
    await call('PATCH', `${base}/members/user-2`, { role: 'admin' }),
  ).toEqual({ status: 422, body: { error: { code: 'INVALID_ROLE' } } });
  outcome = { rows: [{ member: { userId: 'user-2', role: 'editor' } }] };
  expect(
    await call('PATCH', `${base}/members/user-2`, { role: 'editor' }),
  ).toEqual({
    status: 200,
    body: { member: { userId: 'user-2', role: 'editor' } },
  });
  outcome = { rows: [{}] };
  expect((await call('DELETE', `${base}/members/user-2`)).status).toBe(204);
  expect(
    (await call('DELETE', `${base}/invitations/${invitation}`)).status,
  ).toBe(204);
});
it('rate limits invite creation and acceptance and refuses other methods', async () => {
  allowed = false;
  for (const [url, body] of [
    [`${base}/invitations`, { email: 'new@example.com', role: 'viewer' }],
    [accept, { token }],
  ] as const)
    expect(await call('POST', url, body)).toEqual({
      status: 429,
      body: { error: { code: 'RATE_LIMITED' } },
    });
  expect(queries).toEqual([]);
  allowed = true;
  for (const [method, url] of [
    ['PUT', `${base}/invitations`],
    ['GET', `${base}/invitations/${invitation}`],
    ['POST', `${base}/members`],
    ['GET', accept],
  ] as const)
    expect((await call(method, url)).status).toBe(405);
});
