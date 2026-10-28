import { getGlobalStartContext } from '@tanstack/react-start';
import { createRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const context: unknown = getGlobalStartContext();
  const nonce =
    typeof context === 'object' &&
    context !== null &&
    'nonce' in context &&
    typeof context.nonce === 'string'
      ? context.nonce
      : undefined;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, retry: false },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    ssr: { nonce: nonce },
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
    server: { requestContext: { nonce?: string } };
  }
}
