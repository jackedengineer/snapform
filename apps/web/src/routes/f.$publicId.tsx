import { createFileRoute } from '@tanstack/react-router';
import { Collector } from '../features/intake/Collector';
import { readCollectorSearch } from '../features/intake/navigation';
import { RespondentFrame, Unavailable } from '../features/intake/screens';
import { responseTitle, unavailableTitle } from '../features/intake/titles';
const publicIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const Route = createFileRoute('/f/$publicId')({
  validateSearch: readCollectorSearch,
  head: ({ params }) => ({
    meta: [
      {
        title: publicIdPattern.test(params.publicId)
          ? responseTitle
          : unavailableTitle,
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: PublicForm,
});
function PublicForm() {
  const { publicId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  if (!publicIdPattern.test(publicId))
    return (
      <RespondentFrame>
        <Unavailable closed={false} />
      </RespondentFrame>
    );
  return (
    <Collector
      key={publicId}
      publicId={publicId.toLowerCase()}
      search={search}
      onNavigate={(next, replace = false) =>
        // The collector moves focus and scroll itself after each step.
        void navigate({ search: next, replace, resetScroll: false })
      }
    />
  );
}
