import { useState } from 'react';
import {
  email,
  password,
  signupSchema,
  loginSchema,
} from '@snapform/contracts/auth';
import type { AuthMode, useAccountForm } from './useAccountForm';

type Values = { name: string; email: string; password: string };
const labels = {
  name: 'Your name',
  email: 'Email address',
  password: 'Password',
};
export function AuthFields({
  mode,
  form,
  clearError,
}: {
  mode: AuthMode;
  form: ReturnType<typeof useAccountForm>['form'];
  clearError: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const fields: (keyof Values)[] =
    mode === 'signup'
      ? ['name', 'email', 'password']
      : mode === 'reset'
        ? ['password']
        : mode === 'login'
          ? ['email', 'password']
          : ['email'];
  const rules = {
    name: signupSchema.shape.name,
    email,
    password: mode === 'login' ? loginSchema.shape.password : password,
  };
  return fields.map((name) => {
    const validate = ({ value }: { value: string }) =>
      rules[name].safeParse(value).error?.issues[0]?.message;
    return (
      <form.Field
        key={name}
        name={name}
        validators={{ onBlur: validate, onSubmit: validate }}
      >
        {(field) => (
          <div className="field">
            <label htmlFor={name}>
              {name === 'password' && mode === 'reset'
                ? 'New password'
                : labels[name]}
            </label>
            <div className={name === 'password' ? 'password-input' : undefined}>
              <input
                id={name}
                name={name}
                required
                type={
                  name === 'email'
                    ? 'email'
                    : name === 'password' && !showPassword
                      ? 'password'
                      : 'text'
                }
                autoComplete={
                  name === 'name'
                    ? 'name'
                    : name === 'email'
                      ? 'email'
                      : mode === 'login'
                        ? 'current-password'
                        : 'new-password'
                }
                maxLength={name === 'name' ? 96 : name === 'email' ? 254 : 128}
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  clearError();
                }}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={`${name}-error ${name === 'password' && mode !== 'login' ? 'password-help' : ''}`}
              />
              {name === 'password' && (
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
            {name === 'password' && mode !== 'login' && (
              <p id="password-help" className="field-help">
                12–128 characters. Spaces and pasting welcome.
              </p>
            )}
            <p id={`${name}-error`} className="field-error">
              {[...new Set(field.state.meta.errors)].join(' ')}
            </p>
          </div>
        )}
      </form.Field>
    );
  });
}
