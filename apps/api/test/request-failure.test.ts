import { createExecutionContext, env } from 'cloudflare:test';
import { httpServerHandler } from 'cloudflare:node';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import worker from '../src/worker.ts';
import {
  failureObservation,
  handleRequestError,
} from '../src/request-observation.ts';
import { sessionCookie } from './session-cookie.ts';

const id = '242c6529-f3d5-416d-a376-eca248b44478',
  workspace = crypto.randomUUID(),
  answer = 'synthetic-private-answer';
class DrizzleQueryError extends Error {}
class NeonDbError extends Error {
  code = '23505';
}
// Any database attempt fails without reaching Neon.
const settings = {
  ...env,
  DATABASE_URL: 'synthetic-not-a-connection-string',
  BETTER_AUTH_SECRET: 'synthetic-auth-secret-for-failure-tests',
};
const failures = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.flatMap(([value]) => {
    if (typeof value !== 'string') return [];
    try {
      const event = JSON.parse(value);
      return event.event === 'http_request_failed' ? [event] : [];
    } catch {
      return [];
    }
  });
afterEach(() => {
  vi.restoreAllMocks();
});

it('describes a failure by route template, class and stable codes only', () => {
  const failure = new DrizzleQueryError(`Failed query: params: ${answer}`, {
    cause: new NeonDbError(`duplicate key ${answer}`),
  });
  const result = failureObservation({
    requestId: id,
    method: 'PATCH',
    path: `/api/v1/public/forms/${workspace}/sessions/${workspace}`,
    error: failure,
    responseStarted: false,
  });
  expect(result).toEqual({
    event: 'http_request_failed',
    requestId: id,
    method: 'PATCH',
    route: '/api/v1/public/forms/:id/sessions/:id',
    status: 500,
    responseStarted: false,
    error: 'DrizzleQueryError',
    cause: 'NeonDbError',
    code: 'UNCLASSIFIED',
    driverCode: '23505',
  });
  expect(JSON.stringify(result)).not.toContain(answer);
  expect(JSON.stringify(result)).not.toContain(workspace);
  expect(
    failureObservation({
      requestId: 'forged-cookie-value',
      method: 'BREW',
      path: '/api/auth/reset-password/AbCdEf0123456789xyzQRS',
      error: answer,
      responseStarted: true,
    }),
  ).toMatchObject({
    requestId: 'unavailable',
    method: 'OTHER',
    route: '/api/auth/reset-password/:value',
    error: 'NonError',
    cause: null,
    code: 'UNCLASSIFIED',
    driverCode: null,
  });
  expect(
    failureObservation({
      requestId: id,
      method: 'GET',
      path: '/api/v1/workspaces',
      error: Error('Wrapped', { cause: Error('INVALID_WORKSPACE_CONTEXT') }),
      responseStarted: false,
    }),
  ).toMatchObject({ error: 'Error', code: 'INVALID_WORKSPACE_CONTEXT' });
});

it('logs one sanitized line for a real Worker 500', async () => {
  const log = vi.spyOn(console, 'error');
  const response = await worker.fetch(
    new Request(`http://127.0.0.1:5173/api/v1/workspaces/${workspace}/forms`, {
      headers: { Cookie: sessionCookie },
    }) as Request<unknown, IncomingRequestCfProperties>,
    settings,
    createExecutionContext(),
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: { code: 'INTERNAL_ERROR' },
  });
  const events = failures(log);
  expect(events).toEqual([
    {
      event: 'http_request_failed',
      requestId: response.headers.get('X-Request-Id'),
      method: 'GET',
      route: '/api/v1/workspaces/:id/forms',
      status: 500,
      responseStarted: false,
      error: 'Error',
      cause: null,
      code: 'UNCLASSIFIED',
      driverCode: null,
    },
  ]);
  const logged = JSON.stringify(log.mock.calls);
  expect(logged).not.toContain(workspace);
  expect(logged).not.toContain('AAAA');
});

it('logs respondent 500s without answers or capabilities', async () => {
  const log = vi.spyOn(console, 'error');
  const capability = 'b'.repeat(43);
  const body = JSON.stringify({
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
    answers: { [crypto.randomUUID()]: { state: 'value', value: answer } },
  });
  const response = await worker.fetch(
    new Request(
      `http://127.0.0.1:5173/api/v1/public/forms/${workspace}/sessions/${crypto.randomUUID()}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(new TextEncoder().encode(body).byteLength),
          Authorization: 'Bearer ' + capability,
          'CF-Connecting-IP': `qa-failure-${crypto.randomUUID()}`,
        },
        body,
      },
    ) as Request<unknown, IncomingRequestCfProperties>,
    settings,
    createExecutionContext(),
  );
  expect(response.status).toBe(500);
  await response.text();
  expect(failures(log)).toMatchObject([
    { route: '/api/v1/public/forms/:id/sessions/:id', method: 'PATCH' },
  ]);
  const logged = JSON.stringify(log.mock.calls);
  for (const secret of [answer, capability, workspace])
    expect(logged).not.toContain(secret);
});

// Express's final handler would print the raw error object after headers.
const app = express();
app.get('/started', (_req, res, next) => {
  res.status(200).write('partial');
  next(new DrizzleQueryError(`Failed query: params: ${answer}`));
});
app.use(handleRequestError);
const server = app.listen(3104);
const serve = httpServerHandler({ port: 3104 }).fetch;
if (!serve) throw Error('Cloudflare HTTP bridge is required.');
afterAll(() => {
  server.close();
});
it('closes a started response and logs it without the raw error', async () => {
  const log = vi.spyOn(console, 'error');
  const response = await serve(
    new Request('https://owned.test/started') as Request<
      unknown,
      IncomingRequestCfProperties
    >,
    {},
    createExecutionContext(),
  );
  await response.text().then(
    () => 'complete',
    () => 'aborted',
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(failures(log)).toMatchObject([
    { error: 'DrizzleQueryError', responseStarted: true, status: 200 },
  ]);
  // A raw Error would serialize as {} here, so require structured strings.
  expect(log.mock.calls.map(([value]) => typeof value)).toEqual(['string']);
  expect(JSON.stringify(log.mock.calls)).not.toContain(answer);
});
