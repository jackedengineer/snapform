import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';

export function LandingExample() {
  const [choice, setChoice] = useState('');
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 1) heading.current?.focus();
  }, [step]);
  return (
    <aside className="landing-example" aria-label="Interactive example form">
      <span className="landing-example-label">Try a little clarity.</span>
      <div className="landing-example-card">
        <p className="sample-progress">{step === 0 ? '1 of 2' : '2 of 2'}</p>
        {step === 0 ? (
          <>
            <h2 ref={heading} tabIndex={-1}>
              What can we
              <br />
              help you with?
            </h2>
            {['A new website', 'A clearer direction', 'Something else'].map(
              (option) => (
                <button
                  type="button"
                  key={option}
                  className="landing-example-option"
                  aria-pressed={choice === option}
                  onClick={() => setChoice(option)}
                >
                  <span aria-hidden="true">
                    {choice === option ? '●' : '○'}
                  </span>
                  {option}
                </button>
              ),
            )}
            <button
              type="button"
              className="button primary sample-next"
              disabled={!choice}
              onClick={() => setStep(1)}
            >
              Continue <span aria-hidden="true">→</span>
            </button>
          </>
        ) : (
          <>
            <h2 ref={heading} tabIndex={-1}>
              A good place
              <br />
              to start.
            </h2>
            <p role="status">
              {choice}. Now there is something useful to talk about.
            </p>
            <p>
              Your forms can ask the next question, follow a relevant path and
              bring every answer together.
            </p>
            <Link className="button primary sample-next" to="/signup">
              Make it yours <span aria-hidden="true">↗</span>
            </Link>
            <button
              type="button"
              className="intake-text-button"
              onClick={() => {
                setStep(0);
                setChoice('');
                requestAnimationFrame(() => heading.current?.focus());
              }}
            >
              Try again
            </button>
          </>
        )}
      </div>
      <span className="landing-example-note">
        An interactive example. Nothing is collected.
      </span>
    </aside>
  );
}
