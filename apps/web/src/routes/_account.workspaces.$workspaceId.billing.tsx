import { createFileRoute } from '@tanstack/react-router';
import { BillingPage } from '../features/billing/BillingPage';
export const Route = createFileRoute(
  '/_account/workspaces/$workspaceId/billing',
)({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Plan and billing · Snapform' },
    ],
  }),
  component: Page,
});
function Page() {
  return <BillingPage workspaceId={Route.useParams().workspaceId} />;
}
