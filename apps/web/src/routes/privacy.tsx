import { createFileRoute } from '@tanstack/react-router';
import { PublicInfo } from '../features/info/PublicInfo';
export const Route = createFileRoute('/privacy')({
  component: Privacy,
  head: () => ({ meta: [{ title: 'Privacy · Snapform' }] }),
});
function Privacy() {
  return (
    <PublicInfo
      title="Your information, explained."
      intro="How Snapform handles information in this private preview. Updated 30 October 2026."
    >
      <section>
        <h2>Who manages your information</h2>
        <p>
          Snapform provides the form service. The business sharing a form
          decides what to ask and how to use the responses. Contact that
          business about its use of your submission, and contact Snapform about
          your account or the service itself.
        </p>
      </section>
      <section>
        <h2>What the service stores</h2>
        <p>
          Account information includes your name, email, password hash and
          session information. Workspaces store form drafts, published versions
          and responses. Technical records help us diagnose requests and
          delivery failures. Operational logs are designed to exclude passwords,
          session credentials and raw answers.
        </p>
      </section>
      <section>
        <h2>Progress in your browser</h2>
        <p>
          A conversation saves progress before final submission. Browser
          recovery is available for up to seven days. Expired recovery data is
          cleaned when collection is next opened; browser site-data controls can
          also remove it. “Forget this browser” clears that local recovery copy;
          it does not delete an already saved server response. Editors may also
          keep local draft recovery copies, which they can remove in the editor.
        </p>
      </section>
      <section>
        <h2>Infrastructure and delivery</h2>
        <p>
          Cloudflare hosts the application, protects public collection with
          Turnstile and stores encrypted backups in private R2 storage. Neon
          stores the PostgreSQL database. Resend handles account and enabled
          notification emails. An enabled business webhook sends response data
          to the destination configured by that business. No AI provider
          processes responses in the current preview.
        </p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>
          Automatic response retention and self-service deletion are still being
          completed. Contact Snapform for a deletion request; this preview does
          not promise immediate erasure. R2 backup objects are configured to
          expire after 30 days, and recovery tooling rejects older signed
          copies. Private operator copies require controlled cleanup. A deletion
          request must also be applied before recovered data is made accessible.
        </p>
      </section>
      <section>
        <h2>Access and requests</h2>
        <p>
          Workspace roles restrict access to forms and responses. You can ask
          about account information, corrections or deletion using the contact
          below. We verify authorization before disclosing or changing private
          information. We do not sell form answers or use them for advertising.
        </p>
      </section>
    </PublicInfo>
  );
}
