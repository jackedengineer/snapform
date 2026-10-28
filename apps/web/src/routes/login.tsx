import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === 'string' ? search.error : undefined,
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
  const { error } = Route.useSearch();
  return <AuthPage mode="login" invalidLink={Boolean(error)} />;
}
