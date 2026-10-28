import { z } from 'zod';
import { isStorableText } from './text.ts';
export const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const password = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Use no more than 128 characters.');
export const signupSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(96, 'Use no more than 96 characters.')
    .refine(isStorableText, 'Use valid text characters.'),
  email,
  password,
  callbackURL: z.literal('/login').optional(),
});
export const loginSchema = z.strictObject({
  email,
  password: z
    .string()
    .min(1, 'Enter your password.')
    .max(128, 'Use no more than 128 characters.'),
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
    token: z.string().min(1).max(1024),
    newPassword: password,
  }),
};
