import { createFileRoute, Link } from '@tanstack/react-router';
import { PublicLinks } from '../features/info/PublicInfo';
import { LandingExample } from '../features/intake/LandingExample';
export const Route = createFileRoute('/')({
  component: Home,
  head: () => ({
    meta: [
      { title: 'Better beginnings · Snapform' },
      {
        name: 'description',
        content:
          'Thoughtful forms for agencies, coaches, consultants and growing teams.',
      },
    ],
  }),
});
function Home() {
  return (
    <div className="landing-shell">
      <header className="intake-header">
        <Link to="/" className="wordmark" aria-label="Snapform home">
          <span className="brand-symbol" aria-hidden="true">
            s
          </span>
          snapform
        </Link>
        <Link to="/login" className="landing-signin">
          Sign in ↗
        </Link>
      </header>
      <main id="main" className="landing-main">
        <section className="landing-hero">
          <p className="intake-eyebrow">GOOD WORK STARTS WITH UNDERSTANDING</p>
          <h1>
            A better
            <br />
            first <em>hello.</em>
          </h1>
          <p>
            Turn a blank page into a thoughtful form. Start with useful
            questions, make them yours and share a link. A clearer first
            conversation starts here.
          </p>
          <Link to="/signup" className="button primary">
            Create your first form <span aria-hidden="true">↗</span>
          </Link>
          <p className="intake-caption">
            For agencies, coaches, consultants and growing teams.
          </p>
        </section>
        <LandingExample />
      </main>
      <section
        className="landing-principles"
        aria-label="A thoughtful first conversation"
      >
        <div>
          <span>01</span>
          <h2>Ask what matters.</h2>
          <p>
            Choose clear questions and relevant paths, so people can focus on
            what’s useful.
          </p>
        </div>
        <div>
          <span>02</span>
          <h2>Make room for context.</h2>
          <p>Give clients space to explain the details behind their project.</p>
        </div>
        <div>
          <span>03</span>
          <h2>Leave with clarity.</h2>
          <p>Let people review their answers before they send them your way.</p>
        </div>
      </section>
      <footer className="landing-footer">
        <span>Snapform · Private preview</span>
        <PublicLinks />
        <Link to="/login">Open your workspace ↗</Link>
      </footer>
    </div>
  );
}
