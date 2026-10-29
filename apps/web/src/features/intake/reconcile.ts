import type { IntakeRecovery } from '@snapform/contracts/intake-progress';
import type { IntakeSession } from '@snapform/contracts/intake';
export function reconcileRecovery(
  record: IntakeRecovery,
  session: IntakeSession,
  replace: boolean,
) {
  if (
    record.publicId !== session.publicId ||
    record.identity.id !== session.id ||
    (record.session && record.session.versionId !== session.versionId)
  )
    throw new Error('Saved form identity changed.');
  const keep = Boolean(
    record.session && session.status === 'collecting' && !replace,
  );
  return {
    record:
      keep && record.session
        ? {
            ...record,
            expiresAt: Date.parse(session.expiresAt),
            session: { ...record.session, expiresAt: session.expiresAt },
          }
        : {
            ...record,
            session,
            pending: null,
            expiresAt: Date.parse(session.expiresAt),
          },
    conflict: Boolean(
      keep && !record.pending && record.session?.revision !== session.revision,
    ),
  };
}
