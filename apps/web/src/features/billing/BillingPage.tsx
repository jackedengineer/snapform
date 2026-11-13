import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { BillingSummary } from '@snapform/contracts/billing';
import { cancelPlan, startCheckout } from './api';
import { loadCheckout } from './checkout';
import { PlanChoices, proPrice } from './PlanChoices';
import { longDate, planStatus, resetDay } from './usage';
import { Usage, useBilling } from './UsageMeter';

function PlanActions({
  billing,
  workspaceId,
  refresh,
}: {
  billing: BillingSummary;
  workspaceId: string;
  refresh: () => Promise<{ data?: BillingSummary }>;
}) {
  const [interval, setInterval] = useState(billing.interval ?? 'monthly'),
    [currency, setCurrency] = useState(billing.currency ?? 'INR'),
    [busy, setBusy] = useState(false),
    [confirming, setConfirming] = useState(false),
    [message, setMessage] = useState('');
  const renewing =
    billing.plan === 'pro' &&
    billing.status === 'active' &&
    !billing.cancelAtPeriodEnd;
  // Checkout success is not payment proof; the plan changes on Razorpay's webhook.
  async function confirmPaid() {
    setMessage('Payment received. Waiting for Razorpay to confirm it…');
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if ((await refresh()).data?.plan === 'pro')
        return setMessage('Pro is active.');
    }
    setMessage(
      'Razorpay hasn’t confirmed the payment yet. Refresh this page in a few minutes.',
    );
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Razorpay Checkout couldn’t open. Try again.',
      );
      setBusy(false);
    }
  }
  const upgrade = () =>
    run(async () => {
      const checkout = await startCheckout(workspaceId, { interval, currency });
      const Razorpay = await loadCheckout();
      new Razorpay({
        key: checkout.key,
        subscription_id: checkout.subscriptionId,
        name: 'Snapform',
        description: 'Pro, ' + proPrice(interval, currency),
        handler: () => void confirmPaid().finally(() => setBusy(false)),
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    });
  const cancel = () =>
    run(async () => {
      await cancelPlan(workspaceId);
      await refresh();
      setConfirming(false);
      setBusy(false);
      setMessage('Pro won’t renew. Live forms stay live after it ends.');
    });
  return (
    <section className="usage-meter" aria-labelledby="change-title">
      {renewing ? (
        <>
          <h2 id="change-title">Cancel Pro</h2>
          <p>
            Pro stays until{' '}
            {longDate.format(new Date(billing.currentPeriodEnd ?? 0))}. After
            that the workspace moves to Free and nothing is deleted.
          </p>
          <div className="billing-actions">
            {confirming ? (
              <>
                <button
                  type="button"
                  className="button primary compact-button"
                  disabled={busy}
                  onClick={() => void cancel()}
                >
                  Cancel at period end
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setConfirming(false)}
                >
                  Keep Pro
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirming(true)}
              >
                Cancel Pro…
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 id="change-title">Upgrade to Pro</h2>
          <PlanChoices
            interval={interval}
            currency={currency}
            onInterval={setInterval}
            onCurrency={setCurrency}
          />
          <button
            type="button"
            className="button primary compact-button"
            disabled={busy}
            onClick={() => void upgrade()}
          >
            Pay {proPrice(interval, currency)} with Razorpay
          </button>
        </>
      )}
      {message && (
        <p role="status" className="usage-note">
          {message}
        </p>
      )}
    </section>
  );
}
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
          {billing.configured && billing.role === 'owner' && (
            <PlanActions
              billing={billing}
              workspaceId={workspaceId}
              refresh={query.refetch}
            />
          )}
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
