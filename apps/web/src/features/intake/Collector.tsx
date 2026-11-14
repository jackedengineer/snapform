import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { evaluateForm } from '@snapform/contracts/evaluate';
import type { Block, Field } from '@snapform/contracts/form';
import { useIntake } from './use-intake';
import { FieldControl } from './FieldControl';
import { Turnstile } from './Turnstile';
import { collectionSteps } from './steps';
import type { CollectionStep } from './steps';
import { resolvePosition } from './navigation';
import type { CollectorSearch } from './navigation';
import { reviewSections } from './summary';
import type { ReviewRow } from './summary';
import {
  documentTitle,
  EmbedUnavailable,
  focusTarget,
  Receipt,
  RespondentFrame,
  Review,
  Unavailable,
  Welcome,
} from './screens';
import { unavailableTitle } from './titles';
const saveLabels = {
  saved: 'Progress saved',
  saving: 'Saving…',
  waiting: 'Saving shortly…',
  offline: 'Not confirmed saved',
  conflict: 'Save conflict',
  blocked: 'Saving unavailable',
  submitted: 'Progress saved',
};
const isField = (block: Block): block is Field => 'required' in block;
const fieldIds = (step: CollectionStep) =>
  step.blocks.filter(isField).map((block) => block.id);
export function Collector({
  publicId,
  search,
  onNavigate,
}: {
  publicId: string;
  search: CollectorSearch;
  onNavigate: (search: CollectorSearch, replace?: boolean) => void;
}) {
  const intake = useIntake(publicId),
    [token, setToken] = useState(''),
    [checkFailed, setCheckFailed] = useState(false),
    [checkAttempt, setCheckAttempt] = useState(0),
    [touched, setTouched] = useState<Set<string>>(new Set()),
    [sending, setSending] = useState(false),
    [cleared, setCleared] = useState(''),
    [confirmation, setConfirmation] = useState<'forget' | 'reload' | null>(
      null,
    );
  const dialog = useRef<HTMLDialogElement>(null),
    entered = useRef(false),
    corrected = useRef(''),
    pendingFocus = useRef(''),
    returnFocus = useRef('');
  const session = intake.progress?.record.session;
  const definition = session?.definition || intake.form?.definition;
  const evaluation = definition
    ? evaluateForm(definition, session?.answers || {})
    : null;
  const steps =
    definition && evaluation?.ok ? collectionSteps(definition, evaluation) : [];
  const status = intake.progress?.status;
  const pendingSubmit = intake.progress?.record.pending?.kind === 'submit';
  const frozen =
    pendingSubmit ||
    ['blocked', 'conflict', 'submitted'].includes(status || '');
  const position =
    session && evaluation?.ok
      ? resolvePosition(steps, evaluation, session.answers, search, frozen)
      : { index: 0, review: false };
  const review = pendingSubmit || position.review,
    index = position.index,
    step = steps[index],
    editing = !review && search.edit === true;
  const card = definition?.presentation === 'card';
  const cardField = card ? step?.blocks.find(isField) : undefined;
  const submitted = Boolean(session) && status === 'submitted';
  const screen = intake.unavailable
    ? 'unavailable'
    : intake.loading
      ? 'loading'
      : !session
        ? definition
          ? 'welcome'
          : 'error'
        : submitted
          ? 'receipt'
          : review
            ? 'review'
            : 'step-' + index;
  const address = review ? 'review' : index + 1;
  useEffect(() => {
    // Keep the address on the step shown so Back, Forward and refresh agree.
    const shown = session && !submitted && step ? String(address) : '';
    if (!shown || search.step === address) corrected.current = '';
    else if (corrected.current !== shown) {
      corrected.current = shown;
      onNavigate(
        editing ? { step: index + 1, edit: true } : { step: address },
        true,
      );
    }
  });
  useEffect(() => {
    if (screen === 'loading') return;
    const initial = !entered.current;
    entered.current = true;
    if (screen === 'error' || (initial && screen === 'welcome')) return;
    const target =
      (pendingFocus.current && document.getElementById(pendingFocus.current)) ||
      document.getElementById(focusTarget);
    pendingFocus.current = '';
    target?.focus();
    if (target?.id === focusTarget) window.scrollTo(0, 0);
  }, [screen, session?.id]);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);
  useEffect(() => {
    setTouched(new Set());
  }, [session?.id]);
  const business = intake.business?.name;
  const pageTitle = intake.unavailable
    ? unavailableTitle
    : documentTitle(definition?.title, business);
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);
  function firstUnfinished() {
    if (!evaluation?.ok) return -1;
    const ids = new Set(evaluation.issues.map((issue) => issue.targetId));
    return steps.findIndex((item) => fieldIds(item).some((id) => ids.has(id)));
  }
  function continueToReview() {
    const blocked = firstUnfinished();
    if (blocked === -1 || !evaluation?.ok) {
      pendingFocus.current = returnFocus.current;
      onNavigate({ step: 'review' });
      return;
    }
    const ids = new Set(fieldIds(steps[blocked]));
    const issue = evaluation.issues.find(
      (item) => item.targetId && ids.has(item.targetId),
    );
    setTouched((previous) => new Set([...previous, ...ids]));
    pendingFocus.current = 'answer-' + issue?.targetId;
    onNavigate({ step: blocked + 1, edit: true });
  }
  function next(event: FormEvent) {
    event.preventDefault();
    if (!evaluation?.ok || !step) return;
    const ids = new Set(fieldIds(step));
    const issue = evaluation.issues.find(
      (item) => item.targetId && ids.has(item.targetId),
    );
    setTouched((previous) => new Set([...previous, ...ids]));
    if (issue) {
      document.getElementById('answer-' + issue.targetId)?.focus();
      return;
    }
    void intake.controller?.flush();
    if (editing) continueToReview();
    else
      onNavigate(
        index + 1 < steps.length ? { step: index + 2 } : { step: 'review' },
      );
  }
  function edit(row: ReviewRow) {
    pendingFocus.current = 'answer-' + row.id;
    returnFocus.current = 'edit-' + row.id;
    onNavigate({ step: row.stepIndex + 1, edit: true });
  }
  async function send() {
    if (!evaluation?.ok || sending || frozen) return;
    // The server repeats validation; this only routes to an unfinished question.
    if (!evaluation.complete && firstUnfinished() !== -1) {
      returnFocus.current = '';
      continueToReview();
      return;
    }
    setSending(true);
    try {
      await intake.controller?.submit();
    } finally {
      setSending(false);
    }
  }
  function clear(message: string) {
    if (intake.busy) return;
    pendingFocus.current = focusTarget;
    setCleared(message);
    onNavigate({}, true);
    void intake.forget();
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
  const embed = search.embed === 1;
  // Without plan flags (an older server or a failed read) nothing changes.
  const badge = intake.plan?.badge !== false;
  if (intake.unavailable)
    return (
      <RespondentFrame business={business} embed={embed} badge={badge}>
        <Unavailable closed={intake.unavailable === 'closed'} />
      </RespondentFrame>
    );
  if (embed && intake.plan?.embed === false)
    return (
      <RespondentFrame business={business} embed badge={badge}>
        <EmbedUnavailable publicId={publicId} />
      </RespondentFrame>
    );
  const messages = [
    ...new Set([intake.error, intake.progress?.message].filter(Boolean)),
  ];
  const ending =
    definition && evaluation?.ok
      ? definition.endings.find((ending) => ending.id === evaluation.endingId)
      : undefined;
  const pageHeading = cardField ? cardField.label : step?.title;
  // Untitled pages still need an H2 before any section headings (H3).
  const StepLabel = review || pageHeading ? 'p' : 'h2';
  return (
    <RespondentFrame
      business={business}
      title={session ? definition?.title : undefined}
      card={card && !review}
      embed={embed}
      badge={badge}
    >
      <p role="status" className="intake-cleared">
        {cleared}
      </p>
      {intake.loading ? (
        <div className="intake-loading" role="status">
          Opening your form…
        </div>
      ) : (
        <>
          {messages.length > 0 && (
            <div role="alert" className="intake-notice">
              {messages.map((message) => (
                <p key={message}>{message}</p>
              ))}
              {!intake.form && (
                <button
                  type="button"
                  className="intake-text-button"
                  onClick={intake.retry}
                >
                  Retry loading
                </button>
              )}
              {['conflict', 'blocked'].includes(status || '') && !review && (
                <button
                  type="button"
                  className="intake-text-button"
                  onClick={() => onNavigate({ step: 'review' })}
                >
                  Review my answers
                </button>
              )}
              {status === 'offline' && (
                <button
                  type="button"
                  className="intake-text-button"
                  onClick={() => void intake.controller?.flush()}
                >
                  {pendingSubmit ? 'Retry sending' : 'Retry saving'}
                </button>
              )}
              {status === 'conflict' && (
                <button
                  type="button"
                  className="intake-text-button"
                  onClick={() => setConfirmation('reload')}
                >
                  Reload saved response
                </button>
              )}
              {status === 'blocked' && (
                <>
                  <button
                    type="button"
                    className="intake-text-button"
                    onClick={intake.retry}
                  >
                    Reload
                  </button>
                  <button
                    type="button"
                    className="intake-text-button"
                    onClick={() => setConfirmation('forget')}
                  >
                    Clear saved answers
                  </button>
                </>
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
            <Welcome
              title={definition.title}
              business={business}
              description={definition.description}
              check={
                !intake.siteKey || checkFailed
                  ? 'failed'
                  : token
                    ? 'ready'
                    : 'checking'
              }
              busy={intake.busy}
              onStart={() => {
                const current = token;
                setToken('');
                setCleared('');
                void intake.start(current);
              }}
              onRetryCheck={() => {
                setCheckFailed(false);
                setToken('');
                if (intake.siteKey) setCheckAttempt((value) => value + 1);
                else intake.retry();
              }}
              onClear={() =>
                clear('Saved answers were cleared from this browser.')
              }
            >
              {intake.siteKey && (
                <Turnstile
                  key={intake.attempt + ':' + checkAttempt}
                  siteKey={intake.siteKey}
                  onToken={(value) => {
                    setToken(value);
                    if (value) setCheckFailed(false);
                  }}
                  onError={() => setCheckFailed(true)}
                />
              )}
            </Welcome>
          )}
          {session && submitted && (
            <Receipt
              sessionId={session.id}
              ending={ending}
              onAnother={() => clear('')}
              onClear={() =>
                clear('Saved answers were cleared from this browser.')
              }
            />
          )}
          {session && !submitted && evaluation?.ok && step && (
            <>
              <div className="intake-progress-line">
                <StepLabel
                  id={review || pageHeading ? undefined : focusTarget}
                  tabIndex={-1}
                >
                  {review
                    ? 'One last look'
                    : `${card ? 'Question' : 'Step'} ${index + 1} of ${steps.length}`}
                </StepLabel>
                <p role="status">{status && saveLabels[status]}</p>
              </div>
              <progress
                aria-label="Form progress"
                max={steps.length}
                value={review ? steps.length : index}
              />
              {review ? (
                <Review
                  sections={reviewSections(steps, evaluation)}
                  status={status}
                  frozen={frozen}
                  pendingSubmit={pendingSubmit}
                  sending={sending}
                  onEdit={edit}
                  onBack={() => onNavigate({ step: steps.length })}
                  onSend={() => void send()}
                />
              ) : (
                <form
                  noValidate
                  onSubmit={next}
                  className={
                    'intake-answer-form' +
                    (cardField ? ' intake-card-question' : '')
                  }
                >
                  {pageHeading && (
                    <h2 id={focusTarget} tabIndex={-1}>
                      {pageHeading}
                    </h2>
                  )}
                  {cardField && (
                    <p className="intake-card-requirement">
                      {cardField.required ? 'Required' : 'Optional'}
                    </p>
                  )}
                  <fieldset
                    disabled={Boolean(frozen)}
                    className="intake-controls"
                  >
                    {fields(step.blocks)}
                  </fieldset>
                  <div className="intake-actions">
                    {!editing && index > 0 && (
                      <button
                        type="button"
                        className="button intake-secondary"
                        onClick={() => onNavigate({ step: index })}
                        disabled={frozen}
                      >
                        ← Back
                      </button>
                    )}
                    <button
                      className="button primary"
                      type="submit"
                      disabled={frozen}
                    >
                      {editing
                        ? 'Back to review'
                        : index + 1 === steps.length
                          ? 'Review answers'
                          : 'Continue'}
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        className="intake-dialog"
        aria-labelledby="intake-dialog-title"
        onCancel={() => setConfirmation(null)}
      >
        <h2 id="intake-dialog-title">
          {confirmation === 'reload'
            ? 'Use the saved response?'
            : 'Clear saved answers?'}
        </h2>
        <p>
          {confirmation === 'reload'
            ? 'This replaces unsent answers in this browser with the saved response. Cancel to keep your browser’s answers.'
            : 'This removes the answers kept in this browser. Anything already saved with the business stays there.'}
        </p>
        <div className="intake-actions">
          <button
            type="button"
            className="button intake-secondary"
            onClick={() => setConfirmation(null)}
          >
            {confirmation === 'reload' ? 'Keep my answers' : 'Keep them'}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              const action = confirmation;
              setConfirmation(null);
              if (action === 'reload') intake.useSaved();
              else clear('Saved answers were cleared from this browser.');
            }}
          >
            {confirmation === 'reload' ? 'Use saved response' : 'Clear answers'}
          </button>
        </div>
      </dialog>
    </RespondentFrame>
  );
}
