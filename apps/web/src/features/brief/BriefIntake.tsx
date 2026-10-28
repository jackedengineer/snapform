import { useRef, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { briefFormSchema } from '@snapform/contracts';
import type { BriefFormValues } from '@snapform/contracts';
import { reviewBrief } from './review';

const initialValues: BriefFormValues = {
  goal: '',
  budget: '',
  currency: 'USD',
  targetDate: '',
};
const labels = {
  goal: 'What would you like to achieve?',
  budget: 'Your budget',
  currency: 'Currency',
  targetDate: 'Ideal start date',
};

export function BriefIntake() {
  const [reviewing, setReviewing] = useState(false);
  const goalRef = useRef<HTMLTextAreaElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const mutation = useMutation({ mutationFn: reviewBrief, gcTime: 0 });
  const form = useForm({
    defaultValues: initialValues,
    validators: { onSubmit: briefFormSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(briefFormSchema.parse(value));
        setReviewing(true);
        requestAnimationFrame(() => reviewHeading.current?.focus());
      } catch {
        // The mutation renders an explicit retry state and retains the form values.
      }
    },
    onSubmitInvalid: () => {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
    },
  });
  const checked = reviewing ? mutation.data : undefined;
  function edit() {
    setReviewing(false);
    mutation.reset();
    requestAnimationFrame(() => goalRef.current?.focus());
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Snapform home">
          <span className="brand-symbol" aria-hidden="true">
            s
          </span>
          snapform<span className="preview-badge">PREVIEW</span>
        </a>
        <span className="topbar-note">A better beginning.</span>
      </header>
      <main id="main" className="intake-layout">
        <aside className="intro">
          <div className="studio">
            <span className="studio-mark" aria-hidden="true">
              N↗
            </span>
            <div>
              STUDIO NORTH<span>Example project intake</span>
            </div>
          </div>
          <p className="eyebrow">GOOD WORK STARTS WITH A CONVERSATION</p>
          <h1>
            Big ideas.
            <br />
            Clear beginnings<span className="accent-dot">.</span>
          </h1>
          <p className="intro-copy">
            Tell us a little about what’s next.
            <br className="desktop-break" /> We’ll help you put it into words.
          </p>
          <div className="intro-note">
            <span aria-hidden="true">↗</span>
            <p>
              Less back-and-forth.
              <br />
              <strong>More getting somewhere.</strong>
            </p>
          </div>
          <p className="privacy-note">
            Preview only. This checks your brief; it does not send or save a
            response. Use example details.
          </p>
        </aside>
        <section className="brief-panel" aria-label="Project brief">
          <div className="panel-top">
            <span className="eyebrow">YOUR NEXT CHAPTER</span>
            <span className="step-label">
              {checked ? '02 / REVIEW' : '01 / THE BRIEF'}
            </span>
          </div>
          <ol className="progress" aria-label="Brief steps">
            <li aria-current={!checked ? 'step' : undefined} className="active">
              1 <span>The details</span>
            </li>
            <li
              aria-current={checked ? 'step' : undefined}
              className={checked ? 'active' : ''}
            >
              2 <span>Your review</span>
            </li>
          </ol>
          {checked ? (
            <div className="review-view">
              <span className="check-label">READY FOR A SECOND LOOK</span>
              <h2 tabIndex={-1} ref={reviewHeading}>
                Looking like a plan.
              </h2>
              <p className="panel-description">
                Here’s your brief. Make sure it sounds like you.
              </p>
              <dl>
                <div>
                  <dt>Your goal</dt>
                  <dd className="goal-answer">{checked.goal}</dd>
                </div>
                <div>
                  <dt>Your budget</dt>
                  <dd>
                    {new Intl.NumberFormat('en', {
                      style: 'currency',
                      currency: checked.currency,
                      maximumFractionDigits: 0,
                    }).format(checked.budget)}{' '}
                    <small>{checked.currency}</small>
                  </dd>
                </div>
                <div>
                  <dt>Ideal start date</dt>
                  <dd>
                    {new Intl.DateTimeFormat('en', {
                      dateStyle: 'long',
                      timeZone: 'UTC',
                    }).format(new Date(`${checked.targetDate}T00:00:00Z`))}
                  </dd>
                </div>
              </dl>
              <button className="button primary" onClick={edit}>
                Edit your details <span aria-hidden="true">↶</span>
              </button>
              <p className="form-footnote">
                Nothing has been sent or saved. You can edit and review again.
              </p>
            </div>
          ) : (
            <>
              <h2>
                A little context.
                <br />A lot of possibility.
              </h2>
              <p className="panel-description">
                Four required details to get the right conversation started.
              </p>
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!mutation.isPending) void form.handleSubmit();
                }}
              >
                <fieldset disabled={mutation.isPending}>
                  <form.Field name="goal">
                    {(field) => (
                      <div className="field">
                        <label htmlFor="goal">{labels.goal}</label>
                        <textarea
                          ref={goalRef}
                          id="goal"
                          required
                          value={field.state.value}
                          maxLength={1000}
                          rows={4}
                          placeholder="A new website? A sharper brand? Tell us what you have in mind…"
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={field.state.meta.errors.length > 0}
                          aria-describedby="goal-help goal-error"
                        />
                        <div className="field-help" id="goal-help">
                          <span>
                            A few sentences is perfect. At least 10 characters.
                          </span>
                          <span>{field.state.value.length}/1000</span>
                        </div>
                        <p id="goal-error" className="field-error">
                          {field.state.meta.errors
                            .map((error) => error?.message)
                            .join(' ')}
                        </p>
                      </div>
                    )}
                  </form.Field>
                  <div className="budget-row">
                    <form.Field name="budget">
                      {(field) => (
                        <div className="field">
                          <label htmlFor="budget">{labels.budget}</label>
                          <input
                            id="budget"
                            required
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="10000000"
                            step="1"
                            placeholder="e.g. 7500"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={field.state.meta.errors.length > 0}
                            aria-describedby="budget-help budget-error"
                          />
                          <p id="budget-help" className="field-help">
                            Whole units. Zero is welcome.
                          </p>
                          <p id="budget-error" className="field-error">
                            {field.state.meta.errors
                              .map((error) => error?.message)
                              .join(' ')}
                          </p>
                        </div>
                      )}
                    </form.Field>
                    <form.Field name="currency">
                      {(field) => (
                        <div className="field">
                          <label htmlFor="currency">{labels.currency}</label>
                          <select
                            id="currency"
                            required
                            value={field.state.value}
                            onChange={(e) => {
                              const result =
                                briefFormSchema.shape.currency.safeParse(
                                  e.target.value,
                                );
                              if (result.success)
                                field.handleChange(result.data);
                            }}
                            onBlur={field.handleBlur}
                          >
                            <option value="USD">USD — US dollar</option>
                            <option value="INR">INR — Indian rupee</option>
                            <option value="EUR">EUR — Euro</option>
                          </select>
                        </div>
                      )}
                    </form.Field>
                  </div>
                  <form.Field name="targetDate">
                    {(field) => (
                      <div className="field">
                        <label htmlFor="targetDate">{labels.targetDate}</label>
                        <input
                          id="targetDate"
                          required
                          type="date"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={field.state.meta.errors.length > 0}
                          aria-describedby="date-help date-error"
                        />
                        <p id="date-help" className="field-help">
                          A starting point, not a commitment.
                        </p>
                        <p id="date-error" className="field-error">
                          {field.state.meta.errors
                            .map((error) => error?.message)
                            .join(' ')}
                        </p>
                      </div>
                    )}
                  </form.Field>
                  {mutation.isError && (
                    <p className="request-error" role="alert">
                      We couldn’t check your brief. Your details are still here.
                      Please try again.
                    </p>
                  )}
                  <button
                    type="submit"
                    className="button primary"
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending
                      ? 'Checking your brief…'
                      : 'Review your brief'}
                    <span aria-hidden="true">↗</span>
                  </button>
                  <p className="form-footnote">
                    You’ll get a chance to review everything next.
                  </p>
                </fieldset>
              </form>
            </>
          )}
        </section>
      </main>
      <footer className="site-footer">
        <span>Thoughtful forms. Better conversations.</span>
        <span>
          Made with <strong>snapform</strong>
        </span>
      </footer>
    </div>
  );
}
