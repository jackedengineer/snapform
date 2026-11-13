import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { EmailOffer, embedCode } from './PublicationControls';

vi.mock('../auth/AccountLayout', () => ({
  useAccountUser: () => ({ id: 'qa-user' }),
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
it('gives a paste-ready embed snippet for the current Snapform origin', () => {
  const publicId = '11111111-1111-4111-8111-111111111111';
  expect(embedCode('https://snapform.jacked.dev', publicId)).toBe(
    `<div data-snapform="${publicId}"></div>\n<script async src="https://snapform.jacked.dev/embed.js"></script>`,
  );
  expect(embedCode('http://127.0.0.1:5173', publicId)).toContain(
    'src="http://127.0.0.1:5173/embed.js"',
  );
});
