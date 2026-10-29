import { afterEach, expect, it, vi } from 'vitest';
import * as api from './webhook-api';
afterEach(() => vi.unstubAllGlobals());
const workspaceId = crypto.randomUUID(),
  formId = crypto.randomUUID(),
  configurationId = crypto.randomUUID();
const settings = {
  enabled: false,
  revision: 1,
  configurationId,
  url: 'https://hooks.example.com/intake',
  verifiedAt: null,
};
it('saves only validated endpoint settings with private uncached requests', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(settings));
  vi.stubGlobal('fetch', fetcher);
  expect(
    await api.saveWebhookSettings(workspaceId, formId, {
      configurationId,
      url: settings.url,
      expectedRevision: 0,
    }),
  ).toEqual(settings);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(
    `/api/v1/workspaces/${workspaceId}/forms/${formId}/webhook`,
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: 'PUT',
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
  });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    configurationId,
    url: settings.url,
    expectedRevision: 0,
  });
});
it('reveals only the requested current key through a POST body and rejects extra response fields', async () => {
  const secret = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ secret }))
    .mockResolvedValueOnce(Response.json({ ...settings, secret }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    await api.revealWebhookSecret(workspaceId, formId, {
      configurationId,
      expectedRevision: 1,
    }),
  ).toEqual({ secret });
  expect(fetcher.mock.calls[0][0]).toBe(
    `/api/v1/workspaces/${workspaceId}/forms/${formId}/webhook/secret`,
  );
  expect(fetcher.mock.calls[0][1].method).toBe('POST');
  expect(fetcher.mock.calls[0][0]).not.toContain(secret);
  await expect(
    api.fetchWebhookSettings(workspaceId, formId),
  ).rejects.toMatchObject({ code: 'unavailable' });
});
it('gives unsafe endpoint input a useful message without making a request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(
    api.saveWebhookSettings(workspaceId, formId, {
      configurationId,
      expectedRevision: 1,
      url: 'https://127.0.0.1/',
    }),
  ).rejects.toMatchObject({
    code: 'invalid',
    message:
      'Use a public HTTPS endpoint on port 443, without credentials or fragments.',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it('previews, queues, toggles and reads history through private typed requests', async () => {
  const deliveryId = crypto.randomUUID(),
    at = new Date().toISOString();
  const preview = {
    id: deliveryId,
    configurationId,
    versionId: crypto.randomUUID(),
    version: 1,
    status: 'preview',
    createdAt: at,
    payload: '{"test":true}',
    url: settings.url,
  };
  const enabled = { ...settings, enabled: true, revision: 2, verifiedAt: at };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(preview))
    .mockResolvedValueOnce(Response.json({ id: deliveryId }, { status: 202 }))
    .mockResolvedValueOnce(Response.json(enabled))
    .mockResolvedValueOnce(Response.json({ deliveries: [] }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    await api.prepareWebhookPreview(workspaceId, formId, {
      configurationId,
      expectedRevision: 1,
      deliveryId,
    }),
  ).toEqual(preview);
  const send = {
    configurationId,
    expectedRevision: 1,
    deliveryId,
    expectedAttempts: 0,
    acknowledgeDuplicateRisk: false,
  };
  expect(await api.sendWebhookDelivery(workspaceId, formId, send)).toEqual({
    id: deliveryId,
  });
  expect(
    await api.toggleWebhookDelivery(workspaceId, formId, {
      configurationId,
      expectedRevision: 1,
      enabled: true,
    }),
  ).toEqual(enabled);
  expect(await api.fetchWebhookHistory(workspaceId, formId)).toEqual({
    deliveries: [],
  });
  const base = `/api/v1/workspaces/${workspaceId}/forms/${formId}/webhook`;
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    base + '/preview',
    base + '/send',
    base,
    base + '/deliveries',
  ]);
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
  });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(send);
  expect(fetcher.mock.calls[2][1].method).toBe('PATCH');
});
it('rejects forged send data before fetch and leaked history/queued receipts afterward', async () => {
  const input = {
    configurationId,
    expectedRevision: 1,
    deliveryId: crypto.randomUUID(),
    expectedAttempts: 0,
    acknowledgeDuplicateRisk: false,
    payload: 'forged',
  };
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(
    api.sendWebhookDelivery(workspaceId, formId, input),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  fetcher
    .mockResolvedValueOnce(Response.json({ deliveries: [], secret: 'private' }))
    .mockResolvedValueOnce(
      Response.json({ id: input.deliveryId, secret: 'private' }),
    );
  await expect(
    api.fetchWebhookHistory(workspaceId, formId),
  ).rejects.toMatchObject({ code: 'unavailable' });
  const valid = {
    configurationId,
    expectedRevision: 1,
    deliveryId: input.deliveryId,
    expectedAttempts: 0,
    acknowledgeDuplicateRisk: false,
  };
  await expect(
    api.sendWebhookDelivery(workspaceId, formId, valid),
  ).rejects.toMatchObject({ code: 'unavailable' });
});
