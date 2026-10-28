import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
export const Route = createFileRoute('/forgot-password')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Reset your password · Snapform' },
    ],
  }),
  component: () => <AuthPage mode="forgot" />,
});
