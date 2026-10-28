import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
export const Route = createFileRoute('/verify-email')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Verify your email · Snapform' },
    ],
  }),
  component: () => <AuthPage mode="verify" />,
});
