import {
  retentionInputSchema,
  retentionSettingsSchema,
} from '@snapform/contracts/retention';
import { request, FormRequestError } from './api';
import type { QueryClient } from '@tanstack/react-query';
export const retentionKey = (userId: string, workspaceId: string) =>
  ['retention', userId, workspaceId] as const;
const path = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/retention`;
export function fetchRetention(workspaceId: string, signal?: AbortSignal) {
  return request(path(workspaceId), { signal }, (value) =>
    retentionSettingsSchema.parse(value),
  );
}
export async function saveRetention(workspaceId: string, raw: unknown) {
  const checked = retentionInputSchema.safeParse(raw);
  if (!checked.success)
    throw new FormRequestError(
      'invalid',
      'Choose a supported retention period and acknowledge permanent deletion.',
    );
  const input = checked.data;
  return request(
    path(workspaceId),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    (value) => retentionSettingsSchema.parse(value),
  );
}
export async function commitRetention(
  cache: QueryClient,
  userId: string,
  workspaceId: string,
  raw: unknown,
) {
  const saved = await saveRetention(workspaceId, raw);
  const key = retentionKey(userId, workspaceId);
  // Cancel reads only after the write commits: every still-pending old snapshot
  // must be ignored before publishing the receipt. Later reads see this commit.
  await cache.cancelQueries({ queryKey: key, exact: true });
  cache.setQueryData(key, saved);
  return saved;
}
