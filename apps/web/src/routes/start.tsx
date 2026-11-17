import { createFileRoute } from '@tanstack/react-router';
import { GuestStart } from '../features/start/GuestStart';
export const Route = createFileRoute('/start')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Build your form · Snapform' },
    ],
  }),
  component: GuestStart,
});
