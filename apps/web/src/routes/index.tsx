import { createFileRoute, Link } from '@tanstack/react-router';
import { PublicLinks } from '../features/info/PublicInfo';
import {
  LandingBrief,
  LandingExample,
} from '../features/intake/LandingExample';

const title = 'Snapform: client intake forms that qualify your enquiries';
const description =
  'Replace your enquiry form with a short intake that asks for scope, budget and timing. Clients check their answers before sending, and a clear brief lands with your team.';
export const Route = createFileRoute('/')({
  component: Home,
  head: () => ({
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
    ],
  }),
});

const proof = [
  [
    'Only the questions that matter',
    'Start from a starter for agencies, consultants, coaches or startups. Rules show a follow-up only when it applies and send each enquiry to the right ending.',
  ],
  [
    'Clients confirm before sending',
    'Every answer appears on one review step, where clients can fix anything before they send. Their progress is saved as they go.',
  ],
  [
    'Every response, safely delivered',
    'Each response is saved before the client sees a confirmation. Read it in your inbox, export CSV, get an email alert or send it on with signed webhooks and a delivery history.',
  ],
];

function Home() {
  return (
    <div className="landing-shell">
      <header className="intake-header">
        <Link to="/" className="wordmark" aria-label="Snapform home">
          snapform
          <span className="wordmark-caret" aria-hidden="true" />
        </Link>
        <nav className="landing-nav" aria-label="Main">
          <Link to="/pricing" className="landing-signin">
            Pricing
          </Link>
          <Link to="/login" className="landing-signin">
            Sign in
          </Link>
        </nav>
      </header>
      <main id="main" className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <h1 id="landing-title">
            Get <em>the brief</em> before the call.
          </h1>
          <p className="landing-lede">
            Replace your enquiry form with a short intake that asks for scope,
            budget and timing. Clients check their answers before sending, and a
            clear brief lands with your team.
          </p>
          <Link to="/start" className="button primary landing-cta">
            Build your enquiry form <span aria-hidden="true">→</span>
          </Link>
          <p className="intake-caption">
            Starters for agencies, consultants, coaches and startups.
          </p>
        </section>
        <div className="landing-visual">
          <LandingExample />
          <LandingBrief />
        </div>
      </main>
      <section className="landing-proof" aria-labelledby="proof-title">
        <h2 id="proof-title">Qualify, route and deliver every enquiry.</h2>
        <ul>
          {proof.map(([heading, text]) => (
            <li key={heading}>
              <h3>{heading}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>
      <footer className="landing-footer">
        <span>Snapform · Private preview</span>
        <PublicLinks />
        <Link to="/login">Open your workspace</Link>
      </footer>
    </div>
  );
}
