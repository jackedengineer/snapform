import { z } from './zod.ts';
import { isStorableText } from './text.ts';
const emailMessage = 'Enter a valid email address.';
export const email = z.pipe(
  z.email(emailMessage).check(z.maxLength(254, emailMessage)),
  z.transform((value: string) => value.toLowerCase()),
);
export const password = z
  .string()
  .check(
    z.minLength(12, 'Use at least 12 characters.'),
    z.maxLength(128, 'Use no more than 128 characters.'),
  );
export const signupSchema = z.strictObject({
  name: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, 'Enter your name.'),
      z.maxLength(96, 'Use no more than 96 characters.'),
      z.refine(isStorableText, 'Use valid text characters.'),
    ),
  email,
  password,
  callbackURL: z.optional(z.literal('/login')),
});
export const loginSchema = z.strictObject({
  email,
  password: z
    .string()
    .check(
      z.minLength(1, 'Enter your password.'),
      z.maxLength(128, 'Use no more than 128 characters.'),
    ),
});
export const authBodies = {
  'sign-up/email': signupSchema,
  'sign-in/email': loginSchema,
  'sign-out': z.strictObject({}),
  'send-verification-email': z.strictObject({
    email,
    callbackURL: z.literal('/login'),
  }),
  'request-password-reset': z.strictObject({
    email,
    redirectTo: z.literal('/reset-password'),
  }),
  'reset-password': z.strictObject({
    token: z.string().check(z.minLength(1), z.maxLength(1024)),
    newPassword: password,
  }),
};
