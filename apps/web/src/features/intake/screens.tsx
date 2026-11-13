import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { resizeMessage } from './embed';
import { responseReference } from './reference';
import { responseTitle } from './titles';
import type { ReviewRow, ReviewSection } from './summary';
import type { ProgressState } from './progress';
// Screens move keyboard and screen-reader focus to this element.
export const focusTarget = 'intake-heading';
const newTab = (
  <>
    <span aria-hidden="true"> ↗</span>
    <span className="visually-hidden"> (opens in a new tab)</span>
  </>
);
export const documentTitle = (title?: string, business?: string) =>
  title && business ? `${title} · ${business}` : responseTitle;
export function RespondentFrame({
  business,
  title,
  card = false,
  embed = false,
  children,
}: {
  business?: string;
  title?: string;
  card?: boolean;
  embed?: boolean;
  children?: ReactNode;
}) {
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = shell.current;
    if (!embed || !element || window.parent === window) return;
    const observer = new ResizeObserver(() =>
      window.parent.postMessage(
        resizeMessage(element.getBoundingClientRect().height),
        '*',
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [embed]);
  return (
    <div
      ref={shell}
      className={'intake-shell' + (embed ? ' intake-embed' : '')}
    >
      {/* A logo can join the business name once forms carry one. */}
      {(business || title) && (
        <header className="intake-bar">
          {business && <p className="intake-business">{business}</p>}
          {title && <h1>{title}</h1>}
        </header>
      )}
      <main id="main" className={'intake-main' + (card ? ' intake-card' : '')}>
        {children}
      </main>
      <footer className="intake-footer">
        <nav aria-label="Help and privacy">
          <a href="/privacy" target="_blank" rel="noopener">
            Privacy{newTab}
          </a>
          <a href="/report-abuse" target="_blank" rel="noopener">
            Report abuse{newTab}
          </a>
        </nav>
        <a href="/" target="_blank" rel="noopener">
          Powered by Snapform{newTab}
        </a>
      </footer>
    </div>
  );
}
export function Unavailable({ closed }: { closed: boolean }) {
  return (
    <section className="intake-unavailable">
      <h1 id={focusTarget} tabIndex={-1}>
        {closed
          ? 'This form isn’t accepting responses right now'
          : 'This form isn’t available'}
      </h1>
      <p className="intake-description">
        {closed ? '' : 'It may have been closed. '}If you need to reach the
        business, contact whoever sent you the link.
      </p>
    </section>
  );
}
function Privacy({
  children,
  onClear,
}: {
  children: ReactNode;
  onClear: () => void;
}) {
  return (
    <details className="intake-privacy">
      <summary>Saving and privacy</summary>
      <p>{children}</p>
      <button type="button" className="intake-text-button" onClick={onClear}>
        Clear saved answers
      </button>
    </details>
  );
}
export function Welcome({
  title,
  description,
  business,
  check,
  busy,
  onStart,
  onRetryCheck,
  onClear,
  children,
}: {
  title: string;
  description: string;
  business?: string;
  check: 'checking' | 'ready' | 'failed';
  busy: boolean;
  onStart: () => void;
  onRetryCheck: () => void;
  onClear: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="intake-welcome">
      <h1 id={focusTarget} tabIndex={-1}>
        {title}
      </h1>
      {description && <p className="intake-description">{description}</p>}
      <p className="intake-privacy-lead">
        {business
          ? // A name such as "Studio North Inc." already ends the sentence.
            `Your answers go to ${business}${/[.!?]$/.test(business) ? '' : '.'}`
          : 'Your answers go to the business that shared this form.'}
      </p>
      {children}
      <div className="intake-start">
        <button
          type="button"
          className="button primary"
          disabled={check !== 'ready' || busy}
          aria-describedby="intake-check"
          onClick={onStart}
        >
          {busy ? 'Opening…' : 'Start'}
        </button>
        <p id="intake-check" role="status" className="intake-check-status">
          {check === 'checking' && !busy ? 'Checking your browser…' : ''}
        </p>
      </div>
      {check === 'failed' && (
        <div role="alert" className="intake-notice">
          <p>
            We couldn’t check your browser. Check your connection, then try
            again.
          </p>
          <button
            type="button"
            className="intake-text-button"
            onClick={onRetryCheck}
          >
            Try again
          </button>
        </div>
      )}
      <Privacy onClear={onClear}>
        Progress is saved as you go and can be recovered in this browser for up
        to seven days. Avoid shared devices for private information.
      </Privacy>
    </section>
  );
}
export function Receipt({
  sessionId,
  ending,
  onAnother,
  onClear,
}: {
  sessionId: string;
  ending?: { title: string; description: string };
  onAnother: () => void;
  onClear: () => void;
}) {
  return (
    <section className="intake-completion">
      <span className="intake-check" aria-hidden="true">
        ✓
      </span>
      <h2 id={focusTarget} tabIndex={-1}>
        {ending?.title || 'Thank you'}
      </h2>
      <p className="intake-description">
        {ending?.description || 'Your response was sent to the business.'}
      </p>
      <div className="intake-reference">
        <p>Your reference</p>
        <p className="intake-reference-code">{responseReference(sessionId)}</p>
        <p>Keep it if you need to follow up.</p>
      </div>
      <button
        type="button"
        className="button intake-secondary"
        onClick={onAnother}
      >
        Submit another response
      </button>
      <Privacy onClear={onClear}>
        This browser keeps a copy of your answers for a short time. If other
        people use this device, clear it now.
      </Privacy>
    </section>
  );
}
export function Review({
  sections,
  status,
  frozen,
  pendingSubmit,
  sending,
  onEdit,
  onBack,
  onSend,
}: {
  sections: ReviewSection[];
  status: ProgressState['status'] | undefined;
  frozen: boolean;
  pendingSubmit: boolean;
  sending: boolean;
  onEdit: (row: ReviewRow) => void;
  onBack: () => void;
  onSend: () => void;
}) {
  return (
    <div className="intake-answer-form">
      <h2 id={focusTarget} tabIndex={-1}>
        Review your answers
      </h2>
      <p className="intake-help">
        Check your answers, then send them to the business. You can’t change
        them after sending.
      </p>
      {sections.map((section) => (
        <section key={section.pageId} className="intake-summary-section">
          {section.title && <h3>{section.title}</h3>}
          <dl className="intake-summary">
            {section.rows.map((row) => (
              <div key={row.id} className="intake-summary-row">
                <dt>{row.label}</dt>
                <dd className="intake-summary-answer">
                  {row.answer}
                  {row.issue && (
                    <span className="intake-field-error">{row.issue}</span>
                  )}
                </dd>
                {!frozen && (
                  <dd className="intake-summary-edit">
                    <button
                      type="button"
                      id={'edit-' + row.id}
                      className="intake-text-button"
                      onClick={() => onEdit(row)}
                    >
                      Edit<span className="visually-hidden"> {row.label}</span>
                    </button>
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </section>
      ))}
      <div className="intake-actions intake-review-actions">
        {!frozen && (
          <button
            type="button"
            className="button intake-secondary"
            onClick={onBack}
          >
            ← Back
          </button>
        )}
        <button
          type="button"
          className="button primary"
          disabled={frozen || sending}
          onClick={onSend}
        >
          {pendingSubmit
            ? status === 'saving'
              ? 'Sending…'
              : 'Waiting to confirm'
            : sending
              ? 'Saving your answers…'
              : 'Send response'}
        </button>
      </div>
    </div>
  );
}
