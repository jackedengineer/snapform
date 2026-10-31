import { z } from 'zod';
const identity = z.uuid().transform((value) => value.toLowerCase());
export const deletionTargetSchema = z.strictObject({
  kind: z.enum(['response', 'workspace']),
  targetId: identity,
});
export type DeletionTarget = z.infer<typeof deletionTargetSchema>;
export const deletionInputSchema = z.strictObject({
  requestId: identity,
  confirmation: z.string().min(1).max(160),
  acknowledgeDeletion: z.literal(true),
});
export const cancelDeletionSchema = z.strictObject({
  expectedRevision: z.int().min(1).max(2147483646),
});
export const deletionRequestSchema = z
  .strictObject({
    id: identity,
    workspaceId: identity,
    kind: z.enum(['response', 'workspace']),
    targetId: identity,
    requestedAt: z.iso.datetime(),
    notBefore: z.iso.datetime(),
    cancelledAt: z.iso.datetime().nullable(),
    deletedAt: z.iso.datetime().nullable(),
    state: z.enum(['scheduled', 'cancelled', 'purging', 'deleted']),
    revision: z.int().min(1),
  })
  .refine((item) => {
    const requested = Date.parse(item.requestedAt),
      deadline = Date.parse(item.notBefore);
    if (
      deadline - requested !== 86400000 ||
      (item.kind === 'workspace' && item.targetId !== item.workspaceId)
    )
      return false;
    if (item.state === 'cancelled')
      return (
        item.cancelledAt !== null &&
        item.deletedAt === null &&
        Date.parse(item.cancelledAt) >= requested &&
        Date.parse(item.cancelledAt) < deadline
      );
    if (item.cancelledAt !== null) return false;
    if (item.state === 'deleted')
      return item.deletedAt !== null && Date.parse(item.deletedAt) >= deadline;
    return item.deletedAt === null;
  }, 'Inconsistent deletion receipt');
export type DeletionInput = z.infer<typeof deletionInputSchema>;
export type DeletionRequest = z.infer<typeof deletionRequestSchema>;
export function deletionConfirmationMatches(
  kind: DeletionRequest['kind'],
  workspaceName: string,
  confirmation: string,
) {
  return confirmation === (kind === 'response' ? 'DELETE' : workspaceName);
}
export function canCancelDeletion(
  request: Pick<DeletionRequest, 'state' | 'notBefore'>,
  now: number,
) {
  return (
    request.state === 'scheduled' &&
    Number.isFinite(now) &&
    now < Date.parse(request.notBefore)
  );
}
