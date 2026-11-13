import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
export const Route = createFileRoute('/login')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { error?: string; redirect?: string } => ({
    error: typeof search.error === 'string' ? search.error : undefined,
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Sign in · Snapform' },
    ],
  }),
  component: Login,
});
function Login() {
  const { error, redirect } = Route.useSearch();
  return (
    <AuthPage mode="login" invalidLink={Boolean(error)} redirect={redirect} />
  );
}
