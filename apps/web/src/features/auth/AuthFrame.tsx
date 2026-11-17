import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { PublicLinks } from '../info/PublicInfo';
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
          snapform
          <span className="wordmark-caret" aria-hidden="true" />
        </Link>
        <nav aria-label="Account">
          <span>{signup ? 'Already here?' : 'New around here?'}</span>
          <Link to={signup ? '/login' : '/signup'}>
            {signup ? 'Sign in' : 'Create account'}
          </Link>
        </nav>
      </header>
      <main id="main" className="auth-layout">
        <aside className="auth-intro">
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
            <p>
              “What would a great
              <br />
              outcome look like?”
            </p>
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
        <PublicLinks />
        <Link to="/">Explore Snapform</Link>
      </footer>
    </div>
  );
}
