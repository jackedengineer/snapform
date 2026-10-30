import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import styles from '../styles.css?url';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: 'Your next project · Snapform' },
        {
          name: 'description',
          content:
            'A clear start for your next project. Build and review a project brief.',
        },
      ],
      links: [
        { rel: 'stylesheet', href: styles },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    }),
    component: Root,
    shellComponent: Document,
    notFoundComponent: () => (
      <main id="main" className="not-found">
        <h1>We couldn’t find that page.</h1>
        <a href="/">Back to Snapform</a>
      </main>
    ),
    errorComponent: () => (
      <main id="main" className="not-found">
        <h1>Something interrupted this page.</h1>
        <p>
          Reload to try again, then check your saved work before continuing.
        </p>
        <a href="/">Start again</a>
      </main>
    ),
  },
);
function Root() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
