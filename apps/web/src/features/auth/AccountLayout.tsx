import { createContext, useContext } from 'react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authPost, currentUser } from './api';
import type { User } from './api';
const AccountContext = createContext<User | null>(null);
export function useAccountUser() {
  const user = useContext(AccountContext);
  if (!user) throw new Error('A verified account layout is required.');
  return user;
}
export function AccountLayout() {
  const queryClient = useQueryClient(),
    navigate = useNavigate();
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
      <main id="main">
        {profile.isPending ? (
          <div className="account-home">
            <p role="status">Loading your account…</p>
          </div>
        ) : profile.isError ? (
          <div className="account-home">
            <h1>Your account is a moment away.</h1>
            <p role="alert">We couldn’t load your account.</p>
            <button
              className="button primary"
              onClick={() => void profile.refetch()}
            >
              Try again
            </button>
          </div>
        ) : profile.data ? (
          <AccountContext.Provider value={profile.data}>
            <Outlet key={profile.data.id} />
          </AccountContext.Provider>
        ) : (
          <div className="account-home">
            <h1>Let’s get you signed in.</h1>
            <p className="intro-copy">Sign in to access your account.</p>
            <Link className="button primary" to="/login">
              Sign in <span aria-hidden="true">↗</span>
            </Link>
          </div>
        )}
        {logout.isError && (
          <p role="alert" className="request-error account-home">
            {logout.error.message}
          </p>
        )}
      </main>
    </>
  );
}
