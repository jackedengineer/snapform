import type { QueryClient } from '@tanstack/react-query';
import type {
  DeletionRequest,
  DeletionTarget,
} from '@snapform/contracts/deletion';
export const deletionKey = (
  userId: string,
  workspaceId: string,
  target: DeletionTarget,
) => ['deletion', userId, workspaceId, target.kind, target.targetId] as const;
export async function cacheConfirmedDeletion(
  client: QueryClient,
  key: ReturnType<typeof deletionKey>,
  receipt: DeletionRequest,
  active: { current: boolean },
) {
  if (!active.current) return false;
  await client.cancelQueries({ queryKey: key, exact: true });
  if (!active.current) return false;
  client.setQueryData(key, receipt);
  return true;
}
