import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { WorkspaceForms, updatedAgo } from './WorkspaceForms';
import { deletionKey } from '../deletion/deletion-cache';

vi.mock('../auth/AccountLayout', () => ({
  useAccountUser: () => ({ id: 'qa-user' }),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => Promise.resolve(),
  Link: ({ children, to }: { children: ReactNode; to: string }) =>
    createElement('a', { 'data-to': to }, children),
}));

it('describes when a form was last updated in plain relative words', () => {
  const now = Date.parse('2026-11-13T12:00:00.000Z');
  expect(updatedAgo('2026-11-13T11:59:30.000Z', now)).toBe('just now');
  expect(updatedAgo('2026-11-13T11:15:00.000Z', now)).toBe('45 minutes ago');
  expect(updatedAgo('2026-11-12T10:00:00.000Z', now)).toBe('yesterday');
  expect(updatedAgo('2026-10-30T12:00:00.000Z', now)).toBe('2 weeks ago');
  expect(updatedAgo('2025-11-13T12:00:00.000Z', now)).toBe('last year');
});
it('shows each form’s status, responses and a direct responses link', () => {
  const workspaceId = crypto.randomUUID();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  const row = (title: string, status: string, responseCount: number) => ({
    id: crypto.randomUUID(),
    title,
    revision: 2,
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    status,
    responseCount,
  });
  client.setQueryData(['forms', 'qa-user', workspaceId, undefined], {
    workspace: { id: workspaceId, name: 'Synthetic workspace', role: 'viewer' },
    forms: [
      row('Draft only', 'draft', 0),
      row('Collecting', 'live', 1),
      row('Busy form', 'live', 1000),
      row('Paused', 'stopped', 12),
    ],
    nextCursor: null,
  });
  try {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(WorkspaceForms, { workspaceId }),
      ),
    );
    for (const text of [
      '>Draft<',
      '>Live<',
      '>Stopped<',
      '0 responses',
      '1 response<',
      '1,000+ responses',
      '12 responses',
      'Updated 3 days ago',
      '>Viewer<',
    ])
      expect(html).toContain(text);
    expect(html.match(/>Responses<\/a>/g)).toHaveLength(3);
    // The machine-readable time may contain any digits, such as 01 in January.
    const visible = html.replace(/<time[^>]*>/g, '<time>');
    for (const text of ['Edit form', '↗', 'WORKSPACE', '01'])
      expect(visible).not.toContain(text);
  } finally {
    client.clear();
  }
});

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
