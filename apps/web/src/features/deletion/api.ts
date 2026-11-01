import {
  deletionRequestSchema,
  deletionEnvelopeSchema,
  deletionTargetSchema,
  scheduleDeletionSchema,
} from '@snapform/contracts/deletion';
import type {
  DeletionRequest,
  DeletionTarget,
} from '@snapform/contracts/deletion';
const messages: Partial<Record<number, string>> = {
  401: 'Sign in again to manage deletion.',
  403: 'Only the workspace owner can manage deletion.',
  404: 'This item or its deletion receipt is unavailable.',
  409: 'The deletion status changed. Refresh before trying again.',
  422: 'Check the confirmation and deletion target, then try again.',
  429: 'Too many requests. Try again in a minute.',
};
export class DeletionError extends Error {
  constructor(readonly status = 0) {
    super(
      messages[status] ||
        'We couldn’t confirm deletion status. Refresh it before trying again.',
    );
  }
}
const path = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/deletions`;
async function request(url: string, init: RequestInit = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new DeletionError(response.status);
    return deletionEnvelopeSchema.parse(await response.json()).deletion;
  } catch (error) {
    if (error instanceof DeletionError) throw error;
    throw new DeletionError();
  }
}
function matching(
  receipt: DeletionRequest | null,
  workspaceId: string,
  target: DeletionTarget,
  id?: string,
) {
  if (
    !receipt ||
    receipt.workspaceId !== workspaceId.toLowerCase() ||
    receipt.kind !== target.kind ||
    receipt.targetId !== target.targetId.toLowerCase() ||
    (id && receipt.id !== id.toLowerCase())
  )
    throw new DeletionError();
  return receipt;
}
export async function fetchDeletion(
  workspaceId: string,
  target: DeletionTarget,
  signal?: AbortSignal,
) {
  const checked = deletionTargetSchema.safeParse(target);
  if (!checked.success) throw new DeletionError(422);
  const receipt = await request(
    path(workspaceId) + '?' + new URLSearchParams(checked.data),
    { signal },
  );
  return receipt === null ? null : matching(receipt, workspaceId, checked.data);
}
export async function scheduleDeletion(workspaceId: string, raw: unknown) {
  const input = scheduleDeletionSchema.safeParse(raw);
  if (!input.success) throw new DeletionError(422);
  return matching(
    await request(path(workspaceId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.data),
    }),
    workspaceId,
    input.data,
    input.data.requestId,
  );
}
export async function cancelDeletion(raw: unknown) {
  const checked = deletionRequestSchema.safeParse(raw);
  if (!checked.success) throw new DeletionError(422);
  const current = checked.data;
  const receipt = matching(
    await request(`${path(current.workspaceId)}/${current.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: current.revision }),
    }),
    current.workspaceId,
    current,
    current.id,
  );
  if (receipt.state !== 'cancelled') throw new DeletionError();
  return receipt;
}
