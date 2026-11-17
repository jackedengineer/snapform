import { afterAll, expect, it } from 'vitest';
import { createExecutionContext } from 'cloudflare:test';
import { httpServerHandler } from 'cloudflare:node';
import express from 'express';
import type { Database } from '@snapform/database';
import {
  handleWebhookRequest,
  matchWebhookRoute,
  webhookSettingsBody,
} from '../src/webhooks.ts';

const configurationId = crypto.randomUUID();
it('reports an endpoint that needs replacement without a stored value', () => {
  expect(
    webhookSettingsBody({
      enabled: true,
      revision: 4,
      configurationId,
      url: null,
      verifiedAt: '2026-11-01T00:00:00.000Z',
      attention: 'DESTINATION_UNAVAILABLE',
    }),
  ).toEqual({
    enabled: true,
    revision: 4,
    configurationId,
    url: null,
    verifiedAt: '2026-11-01T00:00:00.000Z',
    attention: 'DESTINATION_UNAVAILABLE',
  });
  const readable = {
    enabled: false,
    revision: 1,
    configurationId,
    url: 'https://hooks.example.com/qa',
    verifiedAt: null,
  };
  expect(webhookSettingsBody({ ...readable, attention: null })).toEqual(
    readable,
  );
  expect(() =>
    webhookSettingsBody({ ...readable, url: null, attention: null }),
  ).toThrow();
});

// A malformed server key would otherwise make every endpoint look unreadable.
const untouched = {
  transaction: async () => {
    throw Error('Database must not be used');
  },
} as unknown as Database;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const route = matchWebhookRoute(req.path);
  if (!route) return next();
  handleWebhookRequest(
    req,
    res,
    untouched,
    'synthetic-verified-actor',
    route,
    'not-a-32-byte-key',
  ).catch(next);
});
const server = app.listen(3105);
const serve = httpServerHandler({ port: 3105 }).fetch;
if (!serve) throw Error('Cloudflare HTTP bridge is required.');
afterAll(() => {
  server.close();
});
it('treats a malformed encryption key as an unavailable integration', async () => {
  const path = `https://owned.test/api/v1/workspaces/${crypto.randomUUID()}/forms/${crypto.randomUUID()}/webhook`;
  for (const method of ['GET', 'PUT']) {
    const body =
      method === 'PUT'
        ? JSON.stringify({
            configurationId,
            expectedRevision: 1,
            url: 'https://hooks.example.com/qa',
          })
        : undefined;
    const response = await serve(
      new Request(path, {
        method,
        ...(body
          ? {
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': String(
                  new TextEncoder().encode(body).byteLength,
                ),
              },
              body,
            }
          : {}),
      }) as Request<unknown, IncomingRequestCfProperties>,
      {},
      createExecutionContext(),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 'WEBHOOK_UNAVAILABLE' },
    });
  }
});
