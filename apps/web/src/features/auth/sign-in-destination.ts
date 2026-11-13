import { invitationTokenFromFragment } from '@snapform/contracts/invitation-token';
import { accountRedirect } from './redirect';
// Separate from redirect.ts so account pages never load invite parsing.
// An invite link keeps its token in the fragment through sign-in, so the
// token never reaches a server in a URL. Anything malformed is dropped.
export function signInDestination(redirect: unknown, fragment: string) {
  if (redirect !== '/invite') return accountRedirect(redirect);
  const token = invitationTokenFromFragment(fragment);
  return token ? `/invite#token=${token}` : accountRedirect(null);
}
