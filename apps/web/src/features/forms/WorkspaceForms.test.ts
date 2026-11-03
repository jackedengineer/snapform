import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { WorkspaceForms } from './WorkspaceForms';
import { deletionKey } from '../deletion/deletion-cache';

vi.mock('../auth/AccountLayout', () => ({
  useAccountUser: () => ({ id: 'qa-user' }),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => Promise.resolve(),
  Link: ({ children }: { children: ReactNode }) =>
    createElement('a', null, children),
}));

it('explains blocked creation and offers retry without opening data settings', async () => {
  const workspaceId = crypto.randomUUID();
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        refetchOnMount: false,
        retryOnMount: false,
      },
    },
  });
  client.setQueryData(['forms', 'qa-user', workspaceId, undefined], {
    workspace: { id: workspaceId, name: 'Synthetic workspace', role: 'owner' },
    forms: [],
    nextCursor: null,
  });
  await expect(
    client.fetchQuery({
      queryKey: deletionKey('qa-user', workspaceId, {
        kind: 'workspace',
        targetId: workspaceId,
      }),
      queryFn: () => Promise.reject(new Error('Synthetic unavailable status')),
    }),
  ).rejects.toThrow('Synthetic unavailable status');
  try {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(WorkspaceForms, { workspaceId }),
      ),
    );
    expect(html).toContain('We couldn’t confirm this workspace is ready');
    expect(html).toContain('Retry workspace check');
    expect(html.indexOf('Retry workspace check')).toBeLessThan(
      html.indexOf('<details'),
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Blank form/);
    expect(html).not.toContain('Synthetic unavailable status');
  } finally {
    client.clear();
  }
});
