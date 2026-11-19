import { createFileRoute, Link } from '@tanstack/react-router';
import { PublicInfo } from '../features/info/PublicInfo';
export const Route = createFileRoute('/terms')({
  component: Terms,
  head: () => ({ meta: [{ title: 'Terms of service · Snapform' }] }),
});
function Terms() {
  return (
    <PublicInfo
      title="The terms for using Snapform."
      intro="These terms apply to anyone who creates an account or pays for Snapform. Updated 19 November 2026."
    >
      <section>
        <h2>Who we are</h2>
        <p>
          Snapform is an online service for creating forms and collecting
          enquiries. It is operated by Chirag Bhugra, an individual business
          based in India (“Snapform”, “we”). Contact us at the address below.
        </p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>
          You need an account to build and publish forms. Give accurate details,
          keep your password private and tell us if you think someone else has
          used your account. You are responsible for what happens in your
          workspaces, including what people you invite do there. You must be
          able to enter a binding contract to use Snapform.
        </p>
      </section>
      <section>
        <h2>Your forms and responses</h2>
        <p>
          You own the forms you create and the responses they collect. You let
          us store, process and deliver them only to run the service for you.
          You decide what your forms ask, so you are responsible for having a
          lawful reason to collect each answer and for telling the people who
          fill them in how you use their information. Our{' '}
          <Link to="/privacy">privacy page</Link> explains how Snapform handles
          information.
        </p>
      </section>
      <section>
        <h2>What you may not do</h2>
        <p>
          Do not use Snapform to break the law, deceive people, send spam, or
          ask for passwords, card numbers or other information people should not
          share in a form. Do not try to break, overload or get around the
          service’s security or limits. We may remove a form or suspend an
          account that does any of these things.{' '}
          <Link to="/report-abuse">Report a concern</Link> if you see one.
        </p>
      </section>
      <section>
        <h2>Plans and payment</h2>
        <p>
          The Free plan costs nothing. Pro is a subscription billed monthly or
          yearly in Indian rupees at the prices on the{' '}
          <Link to="/pricing">pricing page</Link>. Razorpay processes payments;
          we never see or store your card details. A subscription renews
          automatically until you cancel it. Cancellation, failed payments and
          refunds work as described in our{' '}
          <Link to="/refunds">cancellation and refund policy</Link>. We will
          give at least 30 days’ notice by email before changing the price of a
          subscription you already have.
        </p>
      </section>
      <section>
        <h2>Availability and changes</h2>
        <p>
          We work to keep Snapform available and your data safe, but the service
          is provided as it is, and it may sometimes be unavailable, for example
          during maintenance. We may improve or change features. If a change
          would take away something you pay for, we will tell you in advance.
        </p>
      </section>
      <section>
        <h2>Ending your use</h2>
        <p>
          You can stop using Snapform and delete your workspace at any time; the
          privacy page explains what happens to your data. We may suspend or
          close an account that breaks these terms, and will tell you why unless
          the law or safety prevents it.
        </p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>
          As far as the law allows, we are not liable for indirect or
          consequential losses, such as lost profits or lost business, and our
          total liability for any claim is limited to the amount you paid
          Snapform in the 12 months before it. Nothing in these terms limits
          rights you have under the law that cannot be limited.
        </p>
      </section>
      <section>
        <h2>Changes to these terms and the law that applies</h2>
        <p>
          We may update these terms. For a significant change we will email
          account owners before it takes effect; continuing to use Snapform
          after that means you accept the new terms. These terms are governed by
          the laws of India.
        </p>
      </section>
    </PublicInfo>
  );
}
