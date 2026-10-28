import { clearDraftStorage, hasDraftStorage } from './draft-storage';
export const draftSessionEnded = 'snapform:draft-session-ended';
export const draftSessionChannel = 'snapform-draft-session';
export async function prepareDraftSignOut(
  prepare?: (() => Promise<void>) | null,
) {
  await prepare?.();
  const localCopies = await hasDraftStorage().catch(() => null);
  if (localCopies === false) return true;
  return window.confirm(
    localCopies === null
      ? 'We couldn’t check local recovery. Signing out may leave local copies on this device. Sign out?'
      : 'Signing out clears local recovery copies on this device. Saved forms stay in your workspace. Sign out?',
  );
}
export async function endDraftSession() {
  window.dispatchEvent(new Event(draftSessionEnded));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(draftSessionChannel);
    channel.postMessage('signed-out');
    channel.close();
  }
  try {
    await clearDraftStorage();
  } catch {
    throw new Error(
      'You’re signed out, but local recovery copies could not be cleared. Clear this site’s browser data on a shared device.',
    );
  }
}
