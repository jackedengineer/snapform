import { createContext, useContext, useEffect, useRef } from 'react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authPost, currentUser } from './api';
import type { User } from './api';
import {
  endDraftSession,
  prepareDraftSignOut,
  draftSessionChannel,
  draftSessionEnded,
} from '../forms/draft-session';
const SignOutGuardContext = createContext<React.RefObject<
  (() => Promise<void>) | null
> | null>(null);
export function useSignOutGuard() {
  return useContext(SignOutGuardContext);
}
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
  const signOutGuard = useRef<(() => Promise<void>) | null>(null);
  const logout = useMutation({
    mutationFn: async () => {
      if (!(await prepareDraftSignOut(signOutGuard.current))) return false;
      await authPost('sign-out', {});
      return true;
    },
    onSuccess: async (signedOut) => {
      if (!signedOut) return;
      try {
        await endDraftSession();
      } finally {
        queryClient.clear();
      }
      await navigate({ to: '/login' });
    },
  });
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(draftSessionChannel);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data !== 'signed-out') return;
      window.dispatchEvent(new Event(draftSessionEnded));
      queryClient.clear();
      void navigate({ to: '/login' });
    };
    return () => channel.close();
  }, [queryClient, navigate]);
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
      <main id="main" inert={logout.isPending}>
        {profile.data ? (
          <AccountContext.Provider value={profile.data}>
            {profile.isError && (
              <p role="alert" className="request-error account-home">
                We couldn’t refresh your session. Local edits are preserved;
                saving still requires a valid session.
              </p>
            )}
            <SignOutGuardContext.Provider value={signOutGuard}>
              <Outlet key={profile.data.id} />
            </SignOutGuardContext.Provider>
          </AccountContext.Provider>
        ) : profile.isPending ? (
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
