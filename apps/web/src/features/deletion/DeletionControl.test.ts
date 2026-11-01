import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { DeletionControl } from './DeletionControl';
import { deletionKey } from './deletion-cache';
const props = {
  userId: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  target: { kind: 'response' as const, targetId: crypto.randomUUID() },
  confirmation: 'DELETE',
  role: 'owner' as const,
};
function render(role: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    deletionKey(props.userId, props.workspaceId, props.target),
    null,
  );
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(DeletionControl, { ...props, role }),
    ),
  );
}
it('keeps the refresh control keyboard-focusable during a status refresh', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const key = deletionKey(props.userId, props.workspaceId, props.target);
  client.setQueryData(key, null);
  let finish: (value: null) => void = () => {};
  const refreshing = client.fetchQuery({
    queryKey: key,
    queryFn: () =>
      new Promise<null>((resolve) => {
        finish = resolve;
      }),
  });
  try {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(DeletionControl, props),
      ),
    );
    const refresh = html.match(
      /<button[^>]*class="text-button deletion-refresh"[^>]*>/,
    )?.[0];
    expect(refresh).toBeDefined();
    expect(refresh).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(refresh).toContain('aria-disabled="true"');
  } finally {
    finish(null);
    await refreshing;
    client.clear();
  }
});
it('shows exact confirmation and the cancellation window only to owners', () => {
  const html = render('owner');
  expect(html).toContain('Delete response');
  expect(html).toContain('24 hours');
  expect(html).toContain('DELETE');
  expect(html).toContain('type="checkbox"');
  for (const role of ['editor', 'viewer']) expect(render(role)).toBe('');
});
