import { createFileRoute, Link } from '@tanstack/react-router';
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
            Better questions.
            <br />
            Better beginnings<span>.</span>
          </h1>
          <p>
            Give every new client a thoughtful place to start. Create a form
            that asks what matters, keeps the context and makes the next
            conversation easier.
          </p>
          <Link to="/signup" className="button primary">
            Create your first form <span aria-hidden="true">↗</span>
          </Link>
          <p className="intake-caption">
            For agencies, coaches, consultants and growing teams.
          </p>
        </section>
        <aside className="landing-example" aria-label="Example project enquiry">
          <span className="landing-example-label">
            A LITTLE CLARITY GOES A LONG WAY
          </span>
          <div className="landing-example-card">
            <span className="intake-eyebrow">YOUR NEXT CHAPTER</span>
            <h2>
              What can we
              <br />
              help you with?
            </h2>
            <div className="landing-example-option">
              <span aria-hidden="true">○</span> A new website
            </div>
            <div className="landing-example-option selected">
              <span aria-hidden="true">●</span> A clearer direction{' '}
              <span aria-hidden="true">↗</span>
            </div>
            <div className="landing-example-option">
              <span aria-hidden="true">○</span> Something else entirely
            </div>
            <p>One good question at a time.</p>
          </div>
          <span className="landing-example-note">Your pace. Your words.</span>
        </aside>
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
        <Link to="/login">Open your workspace ↗</Link>
      </footer>
    </div>
  );
}
