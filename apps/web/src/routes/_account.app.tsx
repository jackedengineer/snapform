import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceHome } from '../features/workspaces/WorkspaceHome';
import { useAccountUser } from '../features/auth/AccountLayout';
export const Route = createFileRoute('/_account/app')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Your workspaces · Snapform' },
    ],
  }),
  component: Account,
});
function Account() {
  const user = useAccountUser();
  return (
    <div className="account-home">
      <p className="eyebrow">YOUR WORK, IN GOOD COMPANY</p>
      <h1>
        Welcome, {user.name}
        <span className="accent-dot">.</span>
      </h1>
      <p className="intro-copy">
        Choose a workspace to build your next conversation.
      </p>
      <WorkspaceHome key={user.id} userId={user.id} />
    </div>
  );
}
