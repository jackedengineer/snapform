import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceForms } from '../features/forms/WorkspaceForms';
export const Route = createFileRoute('/_account/workspaces/$workspaceId/')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Forms · Snapform' },
    ],
  }),
  component: Page,
});
function Page() {
  return <WorkspaceForms workspaceId={Route.useParams().workspaceId} />;
}
