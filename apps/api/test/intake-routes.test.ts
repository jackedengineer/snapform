import { SELF, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { matchIntakeRoute } from '../src/intake-routes.ts';
const publicId = crypto.randomUUID(),
  id = crypto.randomUUID(),
  root = `/api/v1/public/forms/${publicId}/sessions`,
  base = 'http://127.0.0.1:5173';
const headers = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + 'a'.repeat(43),
};
const body = JSON.stringify({ id, challengeToken: 'XXXX.DUMMY.TOKEN.XXXX' });
it('matches exact intake identities without accepting ownership or arbitrary actions', () => {
  expect(matchIntakeRoute(root)).toEqual({ kind: 'start', publicId });
  expect(matchIntakeRoute(root + '/' + id)).toEqual({
    kind: 'session',
    publicId,
    id,
  });
  expect(matchIntakeRoute(root + '/' + id + '/other')).toBeNull();
});
it('requires a dedicated bearer credential and refuses account-cookie fallback', async () => {
  for (const path of [root, root + '/' + id]) {
    const response = await SELF.fetch(base + path, {
      ...(path === root
        ? {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: 'snapform.session_token=forged',
            },
            body,
          }
        : { headers: { Cookie: 'snapform.session_token=forged' } }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
});
it('bounds anonymous creation and keeps official dummy keys off production mode', async () => {
  expect(
    (await SELF.fetch(base + root, { method: 'POST', body: 'plain' })).status,
  ).toBe(415);
  expect(
    (
      await SELF.fetch(base + root, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: 'x'.repeat(17000) }),
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await SELF.fetch(base + root, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id,
          challengeToken: 'token',
          workspaceId: crypto.randomUUID(),
        }),
      })
    ).status,
  ).toBe(422);
  expect(
    (await SELF.fetch(base + root, { method: 'POST', headers, body })).status,
  ).toBe(503);
  expect(
    (
      await SELF.fetch(base + root, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://evil.test' },
        body,
      })
    ).status,
  ).toBe(403);
});
it('limits session starts before spending provider or database work', async () => {
  const key = '198.51.100.43';
  for (let i = 0; i < 20; i++) await env.INTAKE_START_RATE_LIMIT.limit({ key });
  const response = await SELF.fetch(base + root, {
    method: 'POST',
    headers: { ...headers, 'cf-connecting-ip': key },
    body,
  });
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
});
it('matches finalization and bounds progress without accepting account fallback or hidden-state claims', async () => {
  expect(matchIntakeRoute(root + '/' + id + '/submission')).toEqual({
    kind: 'submit',
    publicId,
    id,
  });
  for (const [path, method] of [
    [root + '/' + id, 'PATCH'],
    [root + '/' + id + '/submission', 'POST'],
  ]) {
    expect(
      (
        await SELF.fetch(base + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Cookie: 'snapform.session_token=forged',
          },
          body: '{}',
        })
      ).status,
    ).toBe(401);
    const invalid = {
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      answers: { [crypto.randomUUID()]: { state: 'not-applicable' } },
    };
    expect(
      (
        await SELF.fetch(base + path, {
          method,
          headers,
          body: JSON.stringify(invalid),
        })
      ).status,
    ).toBe(422);
  }
});
it('limits progress mutations before reading Neon', async () => {
  const key = '198.51.100.44';
  for (let i = 0; i < 60; i++)
    await env.INTAKE_WRITE_RATE_LIMIT.limit({ key: 'ip:' + key });
  const response = await SELF.fetch(base + root + '/' + id, {
    method: 'PATCH',
    headers: { ...headers, 'cf-connecting-ip': key },
    body: JSON.stringify({
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      answers: {},
    }),
  });
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
});
