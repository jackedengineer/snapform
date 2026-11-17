import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import {
  EmailOffer,
  EmbedOffer,
  embedAllowed,
  embedCode,
} from './PublicationControls';
import { request } from './api';

vi.mock('../auth/AccountLayout', () => ({
  useAccountUser: () => ({ id: 'qa-user' }),
}));
// Router links render as plain anchors; the router itself is not under test.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string;
    params: { workspaceId: string };
    children: string;
  }) =>
    createElement(
      'a',
      { href: to.replace('$workspaceId', params.workspaceId) },
      children,
    ),
}));

function render(enabled: boolean, owner: boolean) {
  const workspaceId = crypto.randomUUID(),
    formId = crypto.randomUUID();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  client.setQueryData(['email-notifications', 'qa-user', workspaceId, formId], {
    settings: { enabled, revision: enabled ? 1 : 0 },
    deliveries: [],
  });
  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(EmailOffer, {
          workspaceId,
          formId,
          userId: 'qa-user',
          owner,
          onDone: () => {},
        }),
      ),
    );
  } finally {
    client.clear();
  }
}
it('offers owner emails after a first publish, checked until the author says no', () => {
  const html = render(false, true);
  expect(html).toContain('Email me when someone responds');
  expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
  expect(html).toContain('>Save<');
});
it('names the workspace owner for editors and stays quiet when already on', () => {
  expect(render(false, false)).toContain(
    'Email the workspace owner when someone responds',
  );
  const on = render(true, true);
  expect(on).not.toContain('type="checkbox"');
  expect(on).toContain('Email notifications are on.');
});
function offer(embed: boolean | null) {
  const workspaceId = crypto.randomUUID();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  if (embed !== null)
    client.setQueryData(['embed', 'qa-user', workspaceId], embed);
  try {
    return {
      workspaceId,
      html: renderToStaticMarkup(
        createElement(
          QueryClientProvider,
          { client },
          createElement(EmbedOffer, {
            workspaceId,
            userId: 'qa-user',
            children: createElement('textarea', { 'aria-label': 'Embed code' }),
          }),
        ),
      ),
    };
  } finally {
    client.clear();
  }
}
it('shows the embed snippet only to Pro workspaces and a one-line upgrade to Free', () => {
  expect(offer(true).html).toBe(
    '<textarea aria-label="Embed code"></textarea>',
  );
  const free = offer(false);
  expect(free.html).not.toContain('textarea');
  expect(free.html).toBe(
    `<p class="embed-upsell">Embed this form on your website with Snapform Pro. <a href="/workspaces/${free.workspaceId}/billing">Upgrade</a></p>`,
  );
  // Until the plan is known, neither is offered.
  expect(offer(null).html).toBe('');
});
it('reads the embed flag from the billing API and rejects anything else', async () => {
  const workspaceId = crypto.randomUUID();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ billing: { plan: 'pro', features: { embed: true } } }),
    )
    .mockResolvedValueOnce(Response.json({ billing: { features: {} } }));
  vi.stubGlobal('fetch', fetcher);
  try {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const read = () =>
      client.fetchQuery({
        queryKey: ['embed-read', crypto.randomUUID()],
        queryFn: () =>
          request(
            `/api/v1/workspaces/${workspaceId}/billing`,
            {},
            embedAllowed,
          ),
      });
    expect(await read()).toBe(true);
    await expect(read()).rejects.toMatchObject({ code: 'unavailable' });
    expect(fetcher.mock.calls[0][0]).toBe(
      `/api/v1/workspaces/${workspaceId}/billing`,
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
it('gives a paste-ready embed snippet for the current Snapform origin', () => {
  const publicId = '11111111-1111-4111-8111-111111111111';
  expect(embedCode('https://snapform.jacked.dev', publicId)).toBe(
    `<div data-snapform="${publicId}"></div>\n<script async src="https://snapform.jacked.dev/embed.js"></script>`,
  );
  expect(embedCode('http://127.0.0.1:5173', publicId)).toContain(
    'src="http://127.0.0.1:5173/embed.js"',
  );
});
