import { Link, useNavigate } from '@tanstack/react-router';
import { AuthFrame } from './AuthFrame';
import { AuthFields } from './AuthFields';
import { useAccountForm } from './useAccountForm';
import type { AuthMode } from './useAccountForm';

const copy = {
  signup: {
    title: 'Make room for better conversations',
    heading: 'Start something good.',
    description: 'Create your account. A clearer intake starts here.',
    action: 'Create account',
  },
  login: {
    title: 'Good to have you back',
    heading: 'Pick up where you left off.',
    description: 'Sign in to your Snapform account.',
    action: 'Sign in',
  },
  forgot: {
    title: 'A fresh start, without the fuss',
    heading: 'Forgot your password?',
    description:
      'We’ll send a secure link if an account exists for this email.',
    action: 'Send reset link',
  },
  reset: {
    title: 'Back to what matters',
    heading: 'Choose a new password.',
    description:
      'Use at least 12 characters. A memorable passphrase works well.',
    action: 'Reset password',
  },
  verify: {
    title: 'One small step to get started',
    heading: 'Verify your email.',
    description:
      'We’ll send a new link if your account still needs verification.',
    action: 'Send verification link',
  },
};
export function AuthPage({
  mode,
  token,
  invalidLink = false,
}: {
  mode: AuthMode;
  token?: string;
  invalidLink?: boolean;
}) {
  const text = copy[mode];
  const navigate = useNavigate();
  const { form, mutation, complete, sentTo, heading, busy, startAgain, ready } =
    useAccountForm(mode, token, () => navigate({ to: '/app' }));
  const brokenReset = mode === 'reset' && (!token || invalidLink);
  return (
    <AuthFrame title={text.title} signup={mode === 'signup'}>
      <section className="auth-panel" aria-label={text.action}>
        <span className="eyebrow">
          {complete ? 'ONE STEP CLOSER' : 'YOUR WORK STARTS HERE'}
        </span>
        <h2 ref={heading} tabIndex={-1}>
          {brokenReset
            ? 'Let’s get you a new link.'
            : complete
              ? mode === 'reset'
                ? 'You’re ready to return.'
                : 'Check your inbox.'
              : text.heading}
        </h2>
        <p className="panel-description">
          {brokenReset
            ? 'This reset link is missing, expired or invalid.'
            : complete
              ? mode === 'reset'
                ? 'Your password is updated. Sign in with your new password.'
                : `If eligible, a ${mode === 'forgot' ? 'reset' : 'verification'} link will arrive at ${sentTo}. Check spam too. The link expires after 15 minutes.`
              : text.description}
        </p>
        {invalidLink && mode === 'login' && (
          <p role="alert" className="request-error">
            That verification link is invalid or expired. Request a fresh one
            below.
          </p>
        )}
        {brokenReset ? (
          <Link className="button primary" to="/forgot-password">
            Request a new link <span aria-hidden="true">↗</span>
          </Link>
        ) : complete ? (
          <>
            <Link className="button primary" to="/login">
              Back to sign in <span aria-hidden="true">↗</span>
            </Link>
            {mode === 'signup' ? (
              <Link className="text-button" to="/verify-email">
                Request another link
              </Link>
            ) : (
              mode !== 'reset' && (
                <button className="text-button" onClick={startAgain}>
                  Request another link
                </button>
              )
            )}
          </>
        ) : (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (ready && !busy.current) void form.handleSubmit();
            }}
          >
            <fieldset disabled={!ready || mutation.isPending}>
              <AuthFields mode={mode} form={form} clearError={mutation.reset} />
              {mode === 'login' && (
                <div className="auth-form-links">
                  <Link to="/forgot-password">Forgot password?</Link>
                  <Link to="/verify-email">Verify email</Link>
                </div>
              )}
              <button
                className="button primary"
                type="submit"
                disabled={!ready || mutation.isPending}
              >
                {!ready
                  ? 'Preparing form…'
                  : mutation.isPending
                    ? 'One moment…'
                    : text.action}
                <span aria-hidden="true">↗</span>
              </button>
            </fieldset>
          </form>
        )}
        {mutation.isError && (
          <p className="request-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <p className="auth-fine-print">
          Your account belongs to you.
          <br />
          We’ll only email you about your account and your work.
        </p>
      </section>
    </AuthFrame>
  );
}
