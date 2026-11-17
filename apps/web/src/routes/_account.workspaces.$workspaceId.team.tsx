import { createFileRoute } from '@tanstack/react-router';
import { TeamPage } from '../features/team/TeamPage';
export const Route = createFileRoute('/_account/workspaces/$workspaceId/team')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Team · Snapform' },
    ],
  }),
  component: Page,
});
function Page() {
  const { workspaceId } = Route.useParams();
  return <TeamPage key={workspaceId} workspaceId={workspaceId} />;
}
