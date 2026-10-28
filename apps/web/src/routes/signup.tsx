import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
export const Route = createFileRoute('/signup')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Create your account · Snapform' },
    ],
  }),
  component: () => <AuthPage mode="signup" />,
});
