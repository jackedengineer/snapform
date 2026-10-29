import { intakeRecoverySchema } from '@snapform/contracts/intake-progress';
import type { IntakeRecovery } from '@snapform/contracts/intake-progress';
import { newIntakeIdentity } from './identity';
export function newRecovery(publicId: string): IntakeRecovery {
  return {
    version: 1,
    publicId,
    identity: newIntakeIdentity(),
    expiresAt: Date.now() + 7 * 86400000,
    session: null,
    pending: null,
  };
}
export function readRecovery(
  value: unknown,
  publicId: string,
  now: number,
): IntakeRecovery | null {
  const parsed = intakeRecoverySchema.safeParse(value);
  if (!parsed.success) return null;
  const record = parsed.data;
  return record.publicId === publicId &&
    record.expiresAt > now &&
    record.expiresAt <= now + 7 * 86400000 + 300000
    ? record
    : null;
}
