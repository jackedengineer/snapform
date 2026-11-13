import { Link } from '@tanstack/react-router';
import { planStatus, resetDay } from './usage';
import { Usage, useBilling } from './UsageMeter';

export function BillingPage({ workspaceId }: { workspaceId: string }) {
  const query = useBilling(workspaceId),
    billing = query.data;
  return (
    <div className="workspace-home billing-page">
      <Link
        className="back-link"
        to="/workspaces/$workspaceId"
        params={{ workspaceId }}
      >
        ← Forms
      </Link>
      <h1>Plan and billing</h1>
      {query.isPending ? (
        <p role="status">Loading your plan…</p>
      ) : !billing ? (
        <p role="alert" className="request-error">
          {query.error?.message}{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </p>
      ) : (
        <>
          <section className="usage-meter" aria-labelledby="plan-title">
            <h2 id="plan-title">{billing.plan === 'pro' ? 'Pro' : 'Free'}</h2>
            <p>{planStatus(billing)}</p>
            <Usage billing={billing} />
            <p className="usage-note">
              Responses reset on {resetDay.format(new Date(billing.resetsAt))}{' '}
              at 00:00 UTC. Seats: {billing.seatsUsed} of {billing.seatLimit}.
            </p>
          </section>
          <p className="usage-note">
            {!billing.configured
              ? 'Billing isn’t configured yet. '
              : billing.role !== 'owner'
                ? 'Only the workspace owner can change the plan. '
                : ''}
            <Link to="/pricing">Compare Free and Pro</Link>
          </p>
        </>
      )}
    </div>
  );
}
