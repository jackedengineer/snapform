import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { evaluateForm } from '@snapform/contracts/evaluate';
import type { Block } from '@snapform/contracts/form';
import { useIntake } from './use-intake';
import { FieldControl } from './FieldControl';
import { Turnstile } from './Turnstile';
import { collectionSteps } from './steps';
export function Collector({ publicId }: { publicId: string }) {
  const intake = useIntake(publicId),
    [token, setToken] = useState(''),
    [stepId, setStepId] = useState(''),
    [review, setReview] = useState(false),
    [touched, setTouched] = useState<Set<string>>(new Set()),
    [forget, setForget] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const session = intake.progress?.record.session;
  const definition = session?.definition || intake.form?.definition;
  const evaluation = definition
    ? evaluateForm(definition, session?.answers || {})
    : null;
  const steps =
    definition && evaluation?.ok ? collectionSteps(definition, evaluation) : [];
  const index = Math.max(
      0,
      steps.findIndex((step) => step.id === stepId),
    ),
    step = steps[index];
  const cardField = step?.blocks.find((block) => 'required' in block);
  const cardQuestion = !review && definition?.presentation === 'card';
  const status = intake.progress?.status;
  const frozen =
    intake.progress?.record.pending?.kind === 'submit' ||
    ['blocked', 'conflict', 'submitted'].includes(status || '');
  useEffect(() => {
    if (session) {
      heading.current?.focus();
      window.scrollTo(0, 0);
    }
  }, [stepId, review, session?.id]);
  useEffect(() => {
    if (status === 'submitted') {
      heading.current?.focus();
      window.scrollTo(0, 0);
    }
  }, [status]);
  useEffect(() => {
    if (forget) dialog.current?.showModal();
    else dialog.current?.close();
  }, [forget]);
  useEffect(() => {
    setReview(false);
    setStepId('');
    setTouched(new Set());
  }, [session?.id]);
  function next(event: FormEvent) {
    event.preventDefault();
    if (!evaluation?.ok || !step) return;
    const ids = new Set(
      step.blocks
        .filter((block) => 'required' in block)
        .map((block) => block.id),
    );
    const issues = evaluation.issues.filter(
      (issue) => issue.targetId && ids.has(issue.targetId),
    );
    setTouched((previous) => new Set([...previous, ...ids]));
    if (issues.length) {
      document.getElementById('answer-' + issues[0].targetId)?.focus();
      return;
    }
    void intake.controller?.flush();
    if (index + 1 < steps.length) setStepId(steps[index + 1].id);
    else setReview(true);
  }
  function fields(blocks: Block[]) {
    return blocks.map((block) => (
      <FieldControl
        key={block.id}
        block={block}
        answer={session?.answers[block.id]}
        error={
          touched.has(block.id) && evaluation?.ok
            ? evaluation.issues.find((issue) => issue.targetId === block.id)
                ?.message
            : undefined
        }
        onChange={(answer) =>
          intake.controller?.edit({
            ...intake.controller.state.record.session?.answers,
            [block.id]: answer,
          })
        }
        onBlur={() =>
          setTouched((previous) => new Set([...previous, block.id]))
        }
      />
    ));
  }
  const ending =
    definition && evaluation?.ok
      ? definition.endings.find((ending) => ending.id === evaluation.endingId)
      : undefined;
  return (
    <div className="intake-shell">
      <header className="intake-header">
        <a href="/" className="wordmark" aria-label="Snapform home">
          <span className="brand-symbol">s</span>snapform
        </a>
        <span>Made for a better conversation</span>
      </header>
      <main
        id="main"
        className={
          'intake-main ' +
          (definition?.presentation === 'card' ? 'intake-card' : '')
        }
      >
        {intake.loading ? (
          <div className="intake-loading" role="status">
            Opening your form…
          </div>
        ) : (
          <>
            {(intake.error || intake.progress?.message) && (
              <div role="alert" className="intake-notice">
                <p>{intake.error || intake.progress?.message}</p>
                {!intake.form && (
                  <button
                    type="button"
                    className="intake-text-button"
                    onClick={intake.retry}
                  >
                    Retry loading
                  </button>
                )}
                {['offline', 'conflict', 'blocked'].includes(status || '') && (
                  <button
                    type="button"
                    className="intake-text-button"
                    onClick={() =>
                      status === 'offline'
                        ? void intake.controller?.flush()
                        : intake.retry()
                    }
                  >
                    {status === 'offline'
                      ? 'Retry confirmation'
                      : 'Reload saved response'}
                  </button>
                )}
              </div>
            )}
            {(intake.storageError || intake.progress?.storageError) && (
              <p role="alert" className="intake-notice">
                Browser recovery is unavailable. Keep this tab open until your
                answers are saved.
              </p>
            )}
            {!session && definition && (
              <section className="intake-welcome">
                <p className="intake-eyebrow">A CLEAR START</p>
                <h1 ref={heading} tabIndex={-1}>
                  {definition.title}
                </h1>
                {definition.description && (
                  <p className="intake-description">{definition.description}</p>
                )}
                <div className="intake-privacy">
                  <span aria-hidden="true">↗</span>
                  <p>
                    Your answers go to the business that shared this form.
                    Progress is saved before submission and can be recovered in
                    this browser for up to seven days. Avoid shared devices for
                    private information.
                  </p>
                </div>
                {intake.siteKey && (
                  <Turnstile
                    key={intake.attempt}
                    siteKey={intake.siteKey}
                    onToken={setToken}
                  />
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={!token || intake.busy}
                  onClick={() => {
                    const current = token;
                    setToken('');
                    void intake.start(current);
                  }}
                >
                  {intake.busy ? 'Opening…' : 'Let’s get started'}
                  <span aria-hidden="true">↗</span>
                </button>
                <p className="intake-caption">
                  You can review and edit everything before sending.
                </p>
              </section>
            )}
            {session && status === 'submitted' ? (
              <section className="intake-completion">
                <span className="intake-check" aria-hidden="true">
                  ✓
                </span>
                <p className="intake-eyebrow">RESPONSE RECEIVED</p>
                <h1 ref={heading} tabIndex={-1}>
                  {ending?.title || 'Thank you.'}
                </h1>
                <p className="intake-description">{ending?.description}</p>
                <p className="intake-reference">
                  Your reference
                  <br />
                  <strong>{session.id}</strong>
                </p>
                <p className="intake-caption">
                  Your response has been saved. Keep the reference if you need
                  to follow up.
                </p>
              </section>
            ) : (
              session &&
              definition &&
              evaluation?.ok &&
              step && (
                <>
                  <div className="intake-progress-line">
                    <span>
                      {review
                        ? 'One last look'
                        : definition.presentation === 'card'
                          ? `Question ${index + 1} of ${steps.length}`
                          : `Step ${index + 1} of ${steps.length}`}
                    </span>
                    <span role="status" aria-live="polite">
                      {status === 'saved'
                        ? 'Progress saved'
                        : status === 'saving'
                          ? 'Saving…'
                          : status === 'waiting'
                            ? 'Saving shortly…'
                            : status === 'offline'
                              ? 'Not confirmed saved'
                              : status === 'conflict'
                                ? 'Save conflict'
                                : 'Saving unavailable'}
                    </span>
                  </div>
                  <progress
                    aria-label="Form progress"
                    max={steps.length}
                    value={review ? steps.length : index + 1}
                  />
                  <form
                    noValidate
                    onSubmit={next}
                    className={
                      'intake-answer-form' +
                      (cardQuestion ? ' intake-card-question' : '')
                    }
                  >
                    <p className="intake-eyebrow">{definition.title}</p>
                    <h1 ref={heading} tabIndex={-1}>
                      {review
                        ? 'Review your answers'
                        : cardQuestion && cardField && 'label' in cardField
                          ? cardField.label
                          : step.title}
                    </h1>
                    {cardQuestion && cardField && 'required' in cardField && (
                      <p className="intake-card-requirement">
                        {cardField.required ? 'Required' : 'Optional'}
                      </p>
                    )}
                    {review && (
                      <p className="intake-description">
                        Make any final changes below. Only the answers relevant
                        to your path will be sent.
                      </p>
                    )}
                    <fieldset
                      disabled={Boolean(frozen)}
                      className="intake-controls"
                    >
                      {review
                        ? steps.map((item) => (
                            <section
                              key={item.id}
                              className="intake-review-section"
                            >
                              {definition.presentation === 'page' && (
                                <h2>{item.title}</h2>
                              )}
                              {fields(item.blocks)}
                            </section>
                          ))
                        : fields(step.blocks)}
                    </fieldset>
                    <div className="intake-actions">
                      {(review || index > 0) && (
                        <button
                          type="button"
                          className="button intake-secondary"
                          onClick={() =>
                            review
                              ? setReview(false)
                              : setStepId(steps[index - 1].id)
                          }
                          disabled={Boolean(frozen)}
                        >
                          ← Back
                        </button>
                      )}
                      {review ? (
                        <button
                          type="button"
                          className="button primary"
                          disabled={Boolean(frozen) || status !== 'saved'}
                          onClick={() => {
                            if (!evaluation.complete) {
                              setTouched(
                                new Set(
                                  evaluation.issues.flatMap((issue) =>
                                    issue.targetId ? [issue.targetId] : [],
                                  ),
                                ),
                              );
                              document
                                .getElementById(
                                  'answer-' + evaluation.issues[0]?.targetId,
                                )
                                ?.focus();
                              return;
                            }
                            void intake.controller?.submit();
                          }}
                        >
                          {intake.progress?.record.pending?.kind === 'submit'
                            ? 'Confirming…'
                            : 'Send response'}
                          <span aria-hidden="true">↗</span>
                        </button>
                      ) : (
                        <button
                          className="button primary"
                          type="submit"
                          disabled={Boolean(frozen)}
                        >
                          {index + 1 === steps.length
                            ? 'Review answers'
                            : 'Continue'}
                          <span aria-hidden="true">→</span>
                        </button>
                      )}
                    </div>
                    {review && (
                      <p className="intake-caption">
                        Sending creates a saved response for the business. You
                        won’t be able to edit it afterward.
                      </p>
                    )}
                  </form>
                </>
              )
            )}
            {definition && (
              <footer className="intake-footer">
                <span>Your pace. Your words.</span>
                <button
                  type="button"
                  className="intake-text-button"
                  disabled={intake.busy || status === 'saving'}
                  onClick={() => setForget(true)}
                >
                  Forget this browser
                </button>
              </footer>
            )}
          </>
        )}
      </main>
      <dialog
        ref={dialog}
        className="intake-dialog"
        onCancel={() => setForget(false)}
      >
        <h2>Forget this browser’s copy?</h2>
        <p>
          This removes recovery from this browser. It does not delete a response
          already sent. Incomplete server progress remains for its recovery
          period.
        </p>
        <div className="intake-actions">
          <button
            type="button"
            className="button intake-secondary"
            onClick={() => setForget(false)}
          >
            Keep it
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setForget(false);
              void intake.forget();
            }}
          >
            Forget copy
          </button>
        </div>
      </dialog>
    </div>
  );
}
