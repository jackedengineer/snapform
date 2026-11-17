import { useEffect, useState } from 'react';
import { guestDraftKey, readGuestDraft } from './guest-draft';

// On sign-up and sign-in: a form built before is waiting on this device.
export function GuestNote({ signup }: { signup: boolean }) {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    try {
      const draft = readGuestDraft(
        localStorage.getItem(guestDraftKey),
        Date.now(),
      );
      if (draft) setTitle(draft.definition.title.trim() || 'Your form');
    } catch {
      setTitle(null);
    }
  }, []);
  if (!title) return null;
  return (
    <p className="guest-note">
      <strong>“{title}” is saved on this device.</strong>{' '}
      {signup
        ? 'Create your account and confirm your email, then sign in here to publish it.'
        : 'Sign in to publish it.'}
    </p>
  );
}
