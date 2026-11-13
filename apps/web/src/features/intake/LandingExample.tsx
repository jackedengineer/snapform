import { useId, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

const services = ['A new website', 'A redesign', 'Brand identity'];
const budgets = ['Under USD 5,000', 'USD 5,000 to 15,000', 'Over USD 15,000'];
type Step = 'service' | 'budget' | 'review' | 'fit' | 'lighter';

// Every step stays in one grid cell so the card keeps the tallest step's height.
export function LandingExample() {
  const id = useId();
  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState('');
  const [budget, setBudget] = useState('');
  function go(next: Step) {
    setStep(next);
    requestAnimationFrame(() => document.getElementById(id + next)?.focus());
  }
  function panel(name: Step, progress: string, title: string, body: ReactNode) {
    return (
      <div
        className={'sample-step' + (step === name ? ' current' : '')}
        inert={step !== name}
      >
        <p className="sample-progress">{progress}</p>
        <h2 id={id + name} tabIndex={-1}>
          {title}
        </h2>
        {body}
      </div>
    );
  }
  function choice(
    name: 'service' | 'budget',
    options: string[],
    value: string,
    set: (value: string) => void,
    next: Step,
  ) {
    return (
      <>
        <fieldset className="sample-options" aria-labelledby={id + name}>
          {options.map((option) => (
            <label key={option} className="landing-example-option">
              <input
                type="radio"
                name={id + name + '-answer'}
                checked={value === option}
                onChange={() => set(option)}
              />
              {option}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="button primary sample-next"
          disabled={!value}
          onClick={() => go(next)}
        >
          Continue <span aria-hidden="true">→</span>
        </button>
      </>
    );
  }
  const ending = (text: string, hint: string) => (
    <>
      <p>{text}</p>
      <p className="sample-hint">{hint}</p>
      <Link className="button primary sample-next" to="/signup">
        Build your enquiry form <span aria-hidden="true">→</span>
      </Link>
      <button
        type="button"
        className="intake-text-button"
        onClick={() => {
          setService('');
          setBudget('');
          go('service');
        }}
      >
        Start again
      </button>
    </>
  );
  return (
    <aside className="landing-example" aria-label="Interactive example form">
      <p className="landing-example-label">Try it as a client</p>
      <div className="landing-example-card">
        {panel(
          'service',
          '1 of 3',
          'What do you need help with?',
          choice('service', services, service, setService, 'budget'),
        )}
        {panel(
          'budget',
          '2 of 3',
          'What’s your budget?',
          choice('budget', budgets, budget, setBudget, 'review'),
        )}
        {panel(
          'review',
          '3 of 3',
          'Check your answers',
          <>
            <dl className="sample-review">
              {(
                [
                  ['Service', service, 'service'],
                  ['Budget', budget, 'budget'],
                ] as const
              ).map(([term, value, target]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>
                    {value}
                    <button
                      type="button"
                      className="intake-text-button"
                      aria-label={'Change ' + term.toLowerCase()}
                      onClick={() => go(target)}
                    >
                      Change
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="button primary sample-next"
              onClick={() => go(budget === budgets[0] ? 'lighter' : 'fit')}
            >
              Send brief <span aria-hidden="true">→</span>
            </button>
          </>,
        )}
        {panel(
          'fit',
          'Sent',
          'Thanks, here’s what happens next',
          ending(
            'The team will reply within one working day.',
            'A rule chose this ending. Try a budget under USD 5,000 to see another.',
          ),
        )}
        {panel(
          'lighter',
          'Sent',
          'Thanks, we may not be the right fit',
          ending(
            'For this budget, a lighter option such as a template may suit you better.',
            'A rule chose this ending from the budget you picked.',
          ),
        )}
      </div>
      <p className="landing-example-note">
        An interactive example. Nothing is collected.
      </p>
    </aside>
  );
}

// The owner's side of the same journey: static, with neutral sample data.
export function LandingBrief() {
  const id = useId();
  return (
    <section className="landing-brief" aria-labelledby={id}>
      <div className="landing-brief-top">
        <h2 id={id}>New brief from Northwind Studio</h2>
        <p className="landing-brief-status">
          <span aria-hidden="true">✓</span> Delivered
        </p>
      </div>
      <dl>
        {[
          ['Service', 'A website redesign'],
          ['Budget', 'USD 15,000 to 50,000'],
          ['Ideal start', 'In 1 to 3 months'],
          ['Decision role', 'I decide'],
        ].map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="landing-brief-note">
        Example brief. Confirmed by the client, then sent to your inbox, email
        and webhook.
      </p>
    </section>
  );
}
