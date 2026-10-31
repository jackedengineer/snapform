import { createFileRoute } from '@tanstack/react-router';
import { PublicInfo } from '../features/info/PublicInfo';
export const Route = createFileRoute('/support')({
  component: Support,
  head: () => ({ meta: [{ title: 'Support · Snapform' }] }),
});
function Support() {
  return (
    <PublicInfo
      title="A little help, a clear next step."
      intro="Get help with your workspace, a form or a response."
    >
      <section>
        <h2>If you’re filling out a form</h2>
        <p>
          The business that shared the form manages its questions and responses.
          Contact them first about your submission or a correction. For a
          technical problem, tell Snapform what happened and which browser you
          used.
        </p>
      </section>
      <section>
        <h2>If you manage a workspace</h2>
        <p>
          Tell us which action failed and when it happened. A form link or
          response reference helps us investigate. After an interrupted save,
          refresh and review the saved state before trying again.
        </p>
      </section>
      <section>
        <h2>Privacy and deletion requests</h2>
        <p>
          Email Snapform for help with account information or deletion. We
          verify that a request comes from the account holder or an authorized
          business representative before changing private data. Self-service
          deletion is still being completed during this preview.
        </p>
      </section>
      <section>
        <h2>What to expect</h2>
        <p>
          This is an early private preview. We review support requests through
          the email below; we do not promise a fixed response time or
          round-the-clock support.
        </p>
      </section>
    </PublicInfo>
  );
}
