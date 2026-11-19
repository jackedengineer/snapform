import { createFileRoute, Link } from '@tanstack/react-router';
import { PublicInfo } from '../features/info/PublicInfo';
export const Route = createFileRoute('/refunds')({
  component: Refunds,
  head: () => ({
    meta: [{ title: 'Cancellation and refund policy · Snapform' }],
  }),
});
function Refunds() {
  return (
    <PublicInfo
      title="Cancelling and refunds."
      intro="How cancelling Snapform Pro, failed payments and refunds work. Snapform is operated by Chirag Bhugra. Updated 19 November 2026."
    >
      <section>
        <h2>Cancelling Pro</h2>
        <p>
          A workspace owner can cancel Pro at any time from Plan and billing.
          Pro stays active until the end of the period you have already paid for
          and then does not renew, so you are not charged again. The workspace
          then moves to the Free plan: live forms stay live and nothing is
          deleted, but Free limits apply.
        </p>
        <p>
          Deleting a workspace does not cancel its subscription by itself.
          Cancel Pro on Plan and billing before you delete the workspace.
        </p>
      </section>
      <section>
        <h2>Refunds</h2>
        <p>
          A payment covers the month or year it starts, so once a billing period
          has begun it is not refunded, in full or in part, when you cancel. We
          do refund in full:
        </p>
        <ul>
          <li>a payment taken twice for the same period;</li>
          <li>
            a renewal taken after your cancellation had already taken effect;
          </li>
          <li>a payment taken because of an error on our side.</li>
        </ul>
        <p>
          Email us within 7 days of the payment with the workspace name and the
          Razorpay payment ID from your receipt. We reply within 3 working days.
          An approved refund goes back to the original payment method through
          Razorpay, usually within 5 to 7 working days.
        </p>
      </section>
      <section>
        <h2>When a payment fails</h2>
        <p>
          If a renewal payment fails, Razorpay retries it. Pro stays on while it
          retries, for up to 30 days after the paid period, and the owner can
          update the card from Plan and billing. If the retries stop without a
          successful payment, the workspace moves to the Free plan. Nothing is
          deleted, and you can start Pro again whenever you like.
        </p>
      </section>
      <section>
        <h2>Delivery</h2>
        <p>
          Snapform is an online service, so nothing is shipped. Pro starts in
          your workspace as soon as Razorpay confirms the payment, usually
          within a minute. Prices are on the{' '}
          <Link to="/pricing">pricing page</Link>; the full{' '}
          <Link to="/terms">terms of service</Link> also apply.
        </p>
      </section>
    </PublicInfo>
  );
}
