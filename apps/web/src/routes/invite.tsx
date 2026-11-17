import { createFileRoute } from '@tanstack/react-router';
import { InviteAccept } from '../features/team/InviteAccept';
// The invite token lives only in this page's URL fragment.
export const Route = createFileRoute('/invite')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
      { title: 'Accept invite · Snapform' },
    ],
  }),
  component: InviteAccept,
});
