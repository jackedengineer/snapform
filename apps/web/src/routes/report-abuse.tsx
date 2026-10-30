import { createFileRoute } from '@tanstack/react-router';
import { PublicInfo } from '../features/info/PublicInfo';
export const Route = createFileRoute('/report-abuse')({
  component: ReportAbuse,
  head: () => ({ meta: [{ title: 'Report abuse · Snapform' }] }),
});
function ReportAbuse() {
  return (
    <PublicInfo
      title="Report a concern."
      intro="Help us investigate a harmful form or misuse of Snapform."
    >
      <section>
        <h2>What to include</h2>
        <p>
          Email the public form link, what concerned you and when you noticed
          it. A short description is enough to begin. We may ask for more
          context through the same email thread.
        </p>
      </section>
      <section>
        <h2>How we review reports</h2>
        <p>
          We assess the reported form and relevant service records, limit access
          to the investigation and may restrict a form while reviewing misuse. A
          report does not automatically prove a violation or guarantee removal.
          We cannot promise anonymity if disclosure is required to investigate
          or respond to a legal obligation.
        </p>
      </section>
      <section>
        <h2>A security issue</h2>
        <p>
          For an account or application security issue, email the same contact
          with “Security” in the subject. Describe the affected page and the
          steps that led to the issue. We do not operate a paid bug-bounty
          program in this preview.
        </p>
      </section>
    </PublicInfo>
  );
}
