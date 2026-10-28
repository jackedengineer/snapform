import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
export function AuthFrame({
  title,
  signup,
  children,
}: {
  title: string;
  signup: boolean;
  children: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <header className="topbar">
        <Link className="wordmark" to="/" aria-label="Snapform home">
          <span className="brand-symbol" aria-hidden="true">
            s
          </span>
          snapform
        </Link>
        <nav aria-label="Account">
          <span>{signup ? 'Already here?' : 'New around here?'}</span>
          <Link to={signup ? '/login' : '/signup'}>
            {signup ? 'Sign in' : 'Create account'}{' '}
            <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>
      <main id="main" className="auth-layout">
        <aside className="auth-intro">
          <p className="eyebrow">THOUGHTFUL FORMS. BETTER CONVERSATIONS.</p>
          <h1>
            {title}
            <span className="accent-dot">.</span>
          </h1>
          <p className="intro-copy">
            Less chasing context.
            <br />
            More getting somewhere.
          </p>
          <div className="auth-specimen" aria-hidden="true">
            <span className="eyebrow">A GOOD BEGINNING</span>
            <p>
              “What would a great
              <br />
              outcome look like?”
            </p>
            <div>
              <span>01 — YOUR NEXT CHAPTER</span>
              <span className="specimen-arrow">↗</span>
            </div>
          </div>
          <p className="auth-caption">
            For agencies, consultants, coaches
            <br />
            and teams with something to build.
          </p>
        </aside>
        {children}
      </main>
      <footer className="site-footer">
        <span>A better beginning.</span>
        <Link to="/">
          Explore a sample intake <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </div>
  );
}
