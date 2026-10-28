import { createFileRoute } from '@tanstack/react-router';
import { FormEditor } from '../features/forms/FormEditor';
export const Route = createFileRoute(
  '/_account/workspaces/$workspaceId/forms/$formId',
)({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Edit form · Snapform' },
    ],
  }),
  component: Page,
});
function Page() {
  const { workspaceId, formId } = Route.useParams();
  return <FormEditor key={formId} workspaceId={workspaceId} formId={formId} />;
}
