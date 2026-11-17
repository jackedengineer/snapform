import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { BillingSummary } from '@snapform/contracts/billing';
import { useAccountUser } from '../auth/AccountLayout';
import { billingQueryKey, fetchBilling } from './api';
import { limitNotice, usageLine } from './usage';
import './billing.css';

export function useBilling(workspaceId: string) {
  const user = useAccountUser();
  return useQuery({
    queryKey: billingQueryKey(user.id, workspaceId),
    queryFn: ({ signal }) => fetchBilling(workspaceId, signal),
  });
}
export function Usage({
  billing,
  workspaceId,
}: {
  billing: BillingSummary;
  workspaceId?: string;
}) {
  const notice = limitNotice(billing);
  return (
    <>
      <div className="usage-row">
        <p>{usageLine(billing)}</p>
        {workspaceId && (
          <Link to="/workspaces/$workspaceId/billing" params={{ workspaceId }}>
            {billing.plan === 'free' ? 'Upgrade' : 'Plan and billing'}
          </Link>
        )}
      </div>
      <meter
        min={0}
        max={billing.responseLimit}
        high={billing.responseLimit * 0.8}
        value={billing.responsesUsed}
        aria-label="Responses used this month"
      />
      {notice && (
        <p role="status" className="usage-notice">
          {notice}
        </p>
      )}
    </>
  );
}
/** Plan usage for the workspace page. Quiet while loading; never blocks forms. */
export function UsageMeter({ workspaceId }: { workspaceId: string }) {
  const query = useBilling(workspaceId);
  if (query.isError)
    return (
      <p className="usage-meter usage-note">
        Plan usage is unavailable right now.{' '}
        <button
          type="button"
          className="text-button"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </p>
    );
  return query.data ? (
    <section className="usage-meter" aria-label="Plan usage">
      <Usage billing={query.data} workspaceId={workspaceId} />
    </section>
  ) : null;
}
