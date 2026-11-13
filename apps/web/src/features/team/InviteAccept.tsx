import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { invitationTokenFromFragment } from '@snapform/contracts/invitation-token';
import { AuthFrame } from '../auth/AuthFrame';
import { currentUser } from '../auth/api';
import { acceptInvite } from './api';
import './team.css';

// The token stays in the URL fragment, which browsers never send to a server.
// It is read here, posted once in a request body, and dropped on success.
export function InviteAccept() {
  const [token, setToken] = useState<string | null>();
  useEffect(() => {
    const read = () =>
      setToken(invitationTokenFromFragment(window.location.hash));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const navigate = useNavigate();
  const profile = useQuery({
    queryKey: ['me'],
    queryFn: currentUser,
    retry: false,
    gcTime: 0,
  });
  const accept = useMutation({
    mutationFn: acceptInvite,
    gcTime: 0,
    // Replace the entry so Back never returns to the spent link.
    onSuccess: (workspaceId) =>
      navigate({
        to: '/workspaces/$workspaceId',
        params: { workspaceId },
        replace: true,
      }),
  });
  return (
    <AuthFrame title="You’re invited" signup={false}>
      <section className="auth-panel invite-accept" aria-label="Accept invite">
        {token === undefined || profile.isPending ? (
          <p role="status">Checking your invite…</p>
        ) : !token ? (
          <>
            <h2>This invite link isn’t complete.</h2>
            <p className="panel-description">
              Open the link from your invite email again, or ask the workspace
              owner for a new invite.
            </p>
          </>
        ) : profile.isError ? (
          <>
            <h2>Let’s try that again.</h2>
            <p role="alert">We couldn’t check your account.</p>
            <button
              className="button primary"
              onClick={() => void profile.refetch()}
            >
              Try again
            </button>
          </>
        ) : !profile.data ? (
          <>
            <h2>Join your team on Snapform.</h2>
            <p className="panel-description">
              Sign in with the email address the invite was sent to.
            </p>
            <Link
              className="button primary"
              to="/login"
              search={{ redirect: '/invite' }}
              hash={`token=${token}`}
            >
              Sign in to accept
            </Link>
            <p className="panel-description">
              New to Snapform? <Link to="/signup">Create an account</Link> with
              that address and verify it, then open the invite link again.
            </p>
          </>
        ) : (
          <>
            <h2>Join your team on Snapform.</h2>
            <p className="panel-description">
              You’re signed in as {profile.data.email}. Accepting adds you to
              the workspace with the role in your invite.
            </p>
            <button
              type="button"
              className="button primary compact-button"
              disabled={accept.isPending}
              onClick={() => accept.mutate(token)}
            >
              {accept.isPending ? 'Joining…' : 'Accept invite'}
            </button>
            {accept.isError && (
              <p role="alert" className="request-error">
                {accept.error.message} To use another account, sign out from{' '}
                <Link to="/app">your workspaces</Link> and open this link again.
              </p>
            )}
          </>
        )}
      </section>
    </AuthFrame>
  );
}
