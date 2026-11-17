import { z } from './zod.ts';
const identity = z.pipe(
  z.uuid(),
  z.transform((value: string) => value.toLowerCase()),
);
export const deletionTargetSchema = z.strictObject({
  kind: z.enum(['response', 'workspace']),
  targetId: identity,
});
export type DeletionTarget = z.infer<typeof deletionTargetSchema>;
export const deletionInputSchema = z.strictObject({
  requestId: identity,
  confirmation: z.string().check(z.minLength(1), z.maxLength(160)),
  acknowledgeDeletion: z.literal(true),
});
export const cancelDeletionSchema = z.strictObject({
  expectedRevision: z.int().check(z.minimum(1), z.maximum(2147483646)),
});
export const scheduleDeletionSchema = z.extend(
  deletionInputSchema,
  deletionTargetSchema.shape,
);
export const deletionRequestSchema = z
  .strictObject({
    id: identity,
    workspaceId: identity,
    kind: z.enum(['response', 'workspace']),
    targetId: identity,
    requestedAt: z.iso.datetime(),
    notBefore: z.iso.datetime(),
    cancelledAt: z.nullable(z.iso.datetime()),
    deletedAt: z.nullable(z.iso.datetime()),
    state: z.enum(['scheduled', 'cancelled', 'purging', 'deleted']),
    revision: z.int().check(z.minimum(1)),
  })
  .check(
    z.refine((item) => {
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
        return (
          item.deletedAt !== null && Date.parse(item.deletedAt) >= deadline
        );
      return item.deletedAt === null;
    }, 'Inconsistent deletion receipt'),
  );
export type DeletionInput = z.infer<typeof deletionInputSchema>;
export type DeletionRequest = z.infer<typeof deletionRequestSchema>;
export const deletionEnvelopeSchema = z.strictObject({
  deletion: z.nullable(deletionRequestSchema),
});
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
