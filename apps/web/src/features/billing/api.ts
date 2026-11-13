import { billingSummarySchema } from '@snapform/contracts/billing';

export const billingQueryKey = (userId: string, workspaceId: string) => [
  'billing',
  userId,
  workspaceId,
];
export const billingPath = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/billing`;
export async function fetchBilling(workspaceId: string, signal?: AbortSignal) {
  try {
    const response = await fetch(billingPath(workspaceId), {
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error('Request failed');
    const body: unknown = await response.json();
    return billingSummarySchema.parse(
      body && typeof body === 'object' && 'billing' in body
        ? body.billing
        : null,
    );
  } catch {
    throw Error('We couldn’t load this workspace’s plan.');
  }
}
