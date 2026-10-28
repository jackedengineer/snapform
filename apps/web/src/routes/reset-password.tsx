import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
export const Route = createFileRoute('/reset-password')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { token?: string; error?: string } => ({
    token:
      typeof search.token === 'string' && search.token.length <= 1024
        ? search.token
        : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Choose a new password · Snapform' },
    ],
  }),
  component: Reset,
});
function Reset() {
  const { token, error } = Route.useSearch();
  return <AuthPage mode="reset" token={token} invalidLink={Boolean(error)} />;
}
