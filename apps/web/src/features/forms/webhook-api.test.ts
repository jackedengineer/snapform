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
