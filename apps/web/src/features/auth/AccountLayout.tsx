import { createContext, useContext, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authPost, currentUser } from './api';
import { signInSearch } from './redirect';
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
  const location = useLocation();
  const signedOut = !profile.data && !profile.isPending && !profile.isError;
  const returnTo = signInSearch(location.pathname, location.searchStr);
  const redirected = useRef(false);
  useEffect(() => {
    // Send signed-out visitors straight to sign-in once, and bring them back
    // here afterwards. The layout can briefly outlive the navigation, so the
    // guard prevents re-redirecting from the sign-in page itself.
    if (!signedOut || redirected.current) return;
    redirected.current = true;
    void navigate({ to: '/login', search: returnTo, replace: true });
  }, [signedOut, returnTo, navigate]);
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
    <div className="app-shell">
      <header className="topbar">
        <Link className="wordmark" to="/app" aria-label="Snapform workspaces">
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
            <p role="status">Taking you to sign in…</p>
            <Link to="/login" search={returnTo}>
              Sign in
            </Link>
          </div>
        )}
        {logout.isError && (
          <p role="alert" className="request-error account-home">
            {logout.error.message}
          </p>
        )}
      </main>
    </div>
  );
}
