import { createFileRoute } from '@tanstack/react-router';
import { ResponseInbox } from '../features/forms/ResponseInbox';
export const Route = createFileRoute(
  '/_account/workspaces/$workspaceId/responses/$formId',
)({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Responses · Snapform' },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { response?: string } => ({
    response: typeof search.response === 'string' ? search.response : undefined,
  }),
  component: Page,
});
function Page() {
  const { workspaceId, formId } = Route.useParams();
  const { response } = Route.useSearch();
  return (
    <ResponseInbox
      key={formId}
      workspaceId={workspaceId}
      formId={formId}
      selected={response}
    />
  );
}
