import { createFileRoute, notFound } from '@tanstack/react-router';
import { Collector } from '../features/intake/Collector';
export const Route = createFileRoute('/f/$publicId')({
  beforeLoad: ({ params }) => {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        params.publicId,
      )
    )
      throw notFound();
  },
  head: () => ({
    meta: [
      { title: 'Your response · Snapform' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: PublicForm,
});
function PublicForm() {
  const { publicId } = Route.useParams();
  return <Collector publicId={publicId.toLowerCase()} />;
}
