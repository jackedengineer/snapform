import { afterAll, expect, it } from 'vitest';
import { createExecutionContext } from 'cloudflare:test';
import { httpServerHandler } from 'cloudflare:node';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { Database } from '@snapform/database';
import { handleFormsRequest, matchFormsRoute } from '../src/forms.ts';
import {
  handlePublicationRequest,
  matchPublicationRoute,
} from '../src/publication.ts';
import {
  handleNotificationRequest,
  matchNotificationRoute,
} from '../src/notifications.ts';
import { handleWebhookRequest, matchWebhookRoute } from '../src/webhooks.ts';
import { formFixture } from '../../../packages/contracts/test/form-fixture.ts';
// Auth is tested by the resource-route tests. Here the real Express/Worker bridge
// receives an already verified actor and a database boundary denying a write.
const blocked = {
  transaction: async () => {
    throw Error('WORKSPACE_DELETION_PENDING');
  },
} as unknown as Database;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const forms = matchFormsRoute(req.path);
  if (forms)
    return handleFormsRequest(
      req,
      res,
      blocked,
      'synthetic-verified-actor',
      forms,
    ).catch(next);
  const publication = matchPublicationRoute(req.path);
  if (publication)
    return handlePublicationRequest(
      req,
      res,
      blocked,
      'synthetic-verified-actor',
      publication,
    ).catch(next);
  const notification = matchNotificationRoute(req.path);
  if (notification)
    return handleNotificationRequest(
      req,
      res,
      blocked,
      'synthetic-verified-actor',
      notification,
    ).catch(next);
  const webhook = matchWebhookRoute(req.path);
  if (webhook)
    return handleWebhookRequest(
      req,
      res,
      blocked,
      'synthetic-verified-actor',
      webhook,
      btoa('s'.repeat(32)),
    ).catch(next);
  res.sendStatus(404);
});
const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(500).json({ error: { code: 'UNAVAILABLE' } });
};
app.use(errorHandler);
const server = app.listen(3103);
const serve = httpServerHandler({ port: 3103 }).fetch;
if (!serve) throw Error('Cloudflare HTTP bridge is required.');
afterAll(() => {
  server.close();
});
const workspace = crypto.randomUUID(),
  form = crypto.randomUUID(),
  base = `https://owned.test/api/v1/workspaces/${workspace}/forms`;
const cases = [
  {
    name: 'form creation',
    url: base,
    method: 'POST',
    body: { id: form, definition: formFixture().definition },
  },
  {
    name: 'publication',
    url: `${base}/${form}/publication`,
    method: 'POST',
    body: { versionId: crypto.randomUUID(), expectedRevision: 1 },
  },
  {
    name: 'notification settings',
    url: `${base}/${form}/notifications`,
    method: 'PUT',
    body: { enabled: false, expectedRevision: 0 },
  },
  {
    name: 'webhook settings',
    url: `${base}/${form}/webhook`,
    method: 'PUT',
    body: {
      configurationId: crypto.randomUUID(),
      expectedRevision: 0,
      url: 'https://hooks.example.com/qa',
    },
  },
];
it.each(cases)(
  'returns the pending-workspace conflict for $name',
  async (entry) => {
    const body = JSON.stringify(entry.body);
    const response = await serve(
      new Request(entry.url, {
        method: entry.method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(new TextEncoder().encode(body).byteLength),
        },
        body,
      }) as Request<unknown, IncomingRequestCfProperties>,
      {},
      createExecutionContext(),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: 'WORKSPACE_DELETION_PENDING' },
    });
  },
);
