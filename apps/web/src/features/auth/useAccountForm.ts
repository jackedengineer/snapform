import { useEffect, useRef, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { signupSchema, loginSchema } from '@snapform/contracts/auth';
import { authPost } from './api';

export type AuthMode = 'signup' | 'login' | 'forgot' | 'reset' | 'verify';
export function useAccountForm(
  mode: AuthMode,
  token: string | undefined,
  onAuthenticated: () => Promise<void>,
) {
  const [sentTo, setSentTo] = useState('');
  const [complete, setComplete] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = useRef(false);
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      authPost(path, body),
    gcTime: 0,
  });
  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      ),
    onSubmit: async ({ value }) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const action =
          mode === 'signup'
            ? {
                path: 'sign-up/email',
                body: { ...signupSchema.parse(value), callbackURL: '/login' },
              }
            : mode === 'login'
              ? {
                  path: 'sign-in/email',
                  body: loginSchema.parse({
                    email: value.email,
                    password: value.password,
                  }),
                }
              : mode === 'forgot'
                ? {
                    path: 'request-password-reset',
                    body: { email: value.email, redirectTo: '/reset-password' },
                  }
                : mode === 'verify'
                  ? {
                      path: 'send-verification-email',
                      body: { email: value.email, callbackURL: '/login' },
                    }
                  : {
                      path: 'reset-password',
                      body: { token, newPassword: value.password },
                    };
        await mutation.mutateAsync(action);
        mutation.reset();
        form.reset();
        if (mode === 'login') await onAuthenticated();
        else {
          setSentTo(value.email);
          setComplete(true);
          requestAnimationFrame(() => heading.current?.focus());
        }
      } catch {
        /* The mutation renders an explicit error; fields stay available for correction. */
      } finally {
        busy.current = false;
      }
    },
  });
  function startAgain() {
    form.setFieldValue('email', sentTo);
    setComplete(false);
    mutation.reset();
    requestAnimationFrame(() => document.getElementById('email')?.focus());
  }
  return { form, mutation, complete, sentTo, heading, busy, startAgain, ready };
}
