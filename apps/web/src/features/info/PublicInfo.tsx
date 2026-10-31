import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import './info.css';
export const contact = 'trainwithchirag@gmail.com';
export function PublicLinks({ newTab = false }: { newTab?: boolean }) {
  return (
    <nav className="public-links" aria-label="Help and privacy">
      {(
        [
          ['/support', 'Support'],
          ['/privacy', 'Privacy'],
          ['/report-abuse', 'Report abuse'],
        ] as const
      ).map(([to, label]) => (
        <Link
          key={to}
          to={to}
          target={newTab ? '_blank' : undefined}
          rel={newTab ? 'noopener noreferrer' : undefined}
          aria-label={newTab ? `${label} (opens in a new tab)` : undefined}
        >
          {label}
          {newTab && <span aria-hidden="true"> ↗</span>}
        </Link>
      ))}
    </nav>
  );
}
export function PublicInfo({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="info-shell">
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
      <main id="main" className="info-main">
        <p className="eyebrow">SNAPFORM · PRIVATE PREVIEW</p>
        <h1>{title}</h1>
        <p className="info-intro">{intro}</p>
        <div className="info-content">{children}</div>
        <aside className="info-contact">
          <h2>Talk to Snapform</h2>
          <a href={`mailto:${contact}`}>{contact}</a>
          <p>
            Include a public form link or response reference when relevant. Keep
            passwords and private answers out of email.
          </p>
        </aside>
      </main>
      <footer className="info-footer">
        <Link to="/">← Back to Snapform</Link>
        <PublicLinks />
      </footer>
    </div>
  );
}
