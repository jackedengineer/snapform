import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceHome } from '../features/workspaces/WorkspaceHome';
import { useAccountUser } from '../features/auth/AccountLayout';
import { GuestImport } from '../features/start/GuestImport';
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
      <h1>
        Welcome, {user.name}
        <span className="accent-dot">.</span>
      </h1>
      <p className="intro-copy">
        Your forms and their responses live in a workspace.
      </p>
      <GuestImport key={'guest:' + user.id} />
      <WorkspaceHome key={user.id} userId={user.id} />
    </div>
  );
}
