import { createExecutionContext, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import worker from '../src/worker.ts';
import { sessionCookie, sessionToken } from './session-cookie.ts';

// An unusable connection string turns any database attempt into a 500.
const settings = {
  ...env,
  DATABASE_URL: 'synthetic-not-a-connection-string',
  BETTER_AUTH_SECRET: 'synthetic-auth-secret-for-boundary-tests',
};
const call = (
  path: string,
  init: RequestInit = {},
  overrides: Partial<typeof settings> = {},
) =>
  worker.fetch(
    new Request('http://127.0.0.1:5173' + path, init) as Request<
      unknown,
      IncomingRequestCfProperties
    >,
    { ...settings, ...overrides },
    createExecutionContext(),
  );
// Direct calls skip the HTTP layer that would otherwise add Content-Length.
const post = (cookie: string, body: string) =>
  call('/api/v1/workspaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(new TextEncoder().encode(body).byteLength),
      Cookie: cookie,
    },
    body,
  });

it('rejects absent or malformed session cookies before opening the database', async () => {
  for (const cookie of [
    undefined,
    'x=y',
    'snapform.session_token=forged',
    `snapform.session_token=${'a'.repeat(32)}.short`,
    `snapform.session_token=${'a'.repeat(32)}.${'A'.repeat(44)}`,
    `snapform.session_token=${'a'.repeat(32)}.%ZZ${'A'.repeat(41)}%3D`,
    `snapform.session_token=.${'A'.repeat(43)}%3D`,
    `__Secure-snapform.session_token=${sessionToken}`,
    `snapform.session_token=forged; ${sessionCookie}`,
  ]) {
    const response = await call(
      '/api/v1/me',
      cookie ? { headers: { Cookie: cookie } } : {},
    );
    expect({ cookie, status: response.status }).toEqual({
      cookie,
      status: 401,
    });
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
});

it('reads private bodies only after the session cookie check', async () => {
  const oversized = '{"name":"' + 'x'.repeat(20000) + '"}';
  for (const body of ['{"name":', oversized])
    expect((await post('x=y', body)).status).toBe(401);
  expect((await post(sessionCookie, '{"name":')).status).toBe(400);
  expect((await post(sessionCookie, oversized)).status).toBe(413);
});

it('passes well-formed session cookies to Better Auth verification', async () => {
  expect(
    (
      await call('/api/v1/me', {
        headers: { Cookie: `theme=dark; ${sessionCookie}` },
      })
    ).status,
  ).toBe(500);
  const secure = { BETTER_AUTH_URL: 'https://snapform.jacked.dev' } as const;
  expect(
    (
      await call(
        '/api/v1/me',
        { headers: { Cookie: `__Secure-${sessionCookie}` } },
        secure,
      )
    ).status,
  ).toBe(500);
  expect(
    (await call('/api/v1/me', { headers: { Cookie: sessionCookie } }, secure))
      .status,
  ).toBe(401);
});

it('limits private requests per client address before opening the database', async () => {
  const address = `qa-private-${crypto.randomUUID()}`;
  for (let i = 0; i < 600; i++)
    await env.PRIVATE_IP_RATE_LIMIT.limit({ key: address });
  const limited = await call('/api/v1/me', {
    headers: { Cookie: sessionCookie, 'CF-Connecting-IP': address },
  });
  expect(limited.status).toBe(429);
  expect(limited.headers.get('Retry-After')).toBe('60');
  expect(await limited.json()).toEqual({ error: { code: 'RATE_LIMITED' } });
  const other = await call('/api/v1/me', {
    headers: {
      Cookie: sessionCookie,
      'CF-Connecting-IP': `qa-private-${crypto.randomUUID()}`,
    },
  });
  expect(other.status).toBe(500);
});

it('limits emailed auth link callbacks per client address before the database', async () => {
  const address = `qa-auth-link-${crypto.randomUUID()}`;
  for (let i = 0; i < 20; i++)
    await env.AUTH_RATE_LIMIT.limit({ key: address });
  for (const path of [
    '/api/auth/verify-email?token=synthetic',
    '/api/auth/reset-password/synthetic',
  ]) {
    const limited = await call(path, {
      headers: { 'CF-Connecting-IP': address },
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
  }
});
