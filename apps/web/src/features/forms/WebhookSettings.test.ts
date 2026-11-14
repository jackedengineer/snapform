import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { WebhookSettings } from '@snapform/contracts/webhook-settings';
import { WebhookEndpointForm } from './WebhookSettings';
import { fetchWebhookSettings } from './webhook-api';

afterEach(() => vi.unstubAllGlobals());
const workspaceId = crypto.randomUUID(),
  formId = crypto.randomUUID(),
  configurationId = crypto.randomUUID();
const unusable = {
  enabled: true,
  revision: 4,
  configurationId,
  url: null,
  verifiedAt: '2026-11-01T00:00:00.000Z',
  attention: 'DESTINATION_UNAVAILABLE',
} as const;
function render(data: WebhookSettings) {
  const client = new QueryClient();
  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(WebhookEndpointForm, {
          workspaceId,
          formId,
          userId: 'qa-user',
          data,
          onStarted: () => {},
          onSettled: async () => {},
        }),
      ),
    );
  } finally {
    client.clear();
  }
}
it('reads an endpoint that needs replacing without its stored address', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(unusable)));
  expect(await fetchWebhookSettings(workspaceId, formId)).toEqual(unusable);
});
it('asks for a new address with the endpoint field empty', () => {
  const html = render(unusable);
  expect(html).toContain(
    'This webhook address can’t be used any more. Enter a new one.',
  );
  expect(html).toMatch(/<input[^>]*type="url"[^>]*value=""/);
  const healthy = render({
    ...unusable,
    url: 'https://hooks.example.com/intake',
    attention: null,
  });
  expect(healthy).not.toContain('can’t be used any more');
  expect(healthy).toContain('value="https://hooks.example.com/intake"');
});
