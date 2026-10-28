import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authPost, currentUser } from '../features/auth/api';
export const Route = createFileRoute('/app')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Your account · Snapform' },
    ],
  }),
  component: Account,
});
function Account() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const profile = useQuery({
    queryKey: ['me'],
    queryFn: currentUser,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const logout = useMutation({
    mutationFn: () => authPost('sign-out', {}),
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: '/login' });
    },
  });
  return (
    <>
      <header className="topbar">
        <Link className="wordmark" to="/" aria-label="Snapform home">
          <span className="brand-symbol" aria-hidden="true">
            s
          </span>
          snapform
        </Link>
        {profile.data && (
          <button
            className="text-button"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        )}
      </header>
      <main id="main" className="account-home">
        {profile.isPending ? (
          <p role="status">Loading your account…</p>
        ) : profile.isError ? (
          <>
            <h1>Your account is a moment away.</h1>
            <p role="alert">We couldn’t load your account.</p>
            <button
              className="button primary"
              onClick={() => void profile.refetch()}
            >
              Try again
            </button>
          </>
        ) : profile.data ? (
          <>
            <span className="check-label">EMAIL VERIFIED</span>
            <h1>
              Welcome, {profile.data.name}
              <span className="accent-dot">.</span>
            </h1>
            <p className="intro-copy">
              You’re signed in as {profile.data.email}.
            </p>
            <p>
              Your account is ready. Workspace setup is the next development
              slice.
            </p>
            {logout.isError && (
              <p role="alert" className="request-error">
                {logout.error.message}
              </p>
            )}
          </>
        ) : (
          <>
            <h1>Let’s get you signed in.</h1>
            <p className="intro-copy">Sign in to access your account.</p>
            <Link className="button primary" to="/login">
              Sign in <span aria-hidden="true">↗</span>
            </Link>
          </>
        )}
      </main>
    </>
  );
}
