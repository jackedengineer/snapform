import { describe, expect, it } from 'vitest';
import { authBodies, signupSchema } from './auth.ts';

describe('auth input contracts', () => {
  const signup = {
    name: '  Synthetic QA  ',
    email: 'QA@example.invalid',
    password: 'Synthetic-QA-passphrase-27',
  };
  it('normalizes names and emails without changing password bytes', () => {
    expect(signupSchema.parse(signup)).toEqual({
      ...signup,
      name: 'Synthetic QA',
      email: 'qa@example.invalid',
    });
  });
  it.each([
    { ...signup, emailVerified: true },
    { ...signup, name: ' '.repeat(5) },
    { ...signup, name: 'A\0B' },
    { ...signup, name: 'A\ud800B' },
    { ...signup, name: 'x'.repeat(97) },
    { ...signup, password: 'short' },
    { ...signup, password: 'x'.repeat(129) },
    { ...signup, email: 'invalid' },
  ])('rejects forged or out-of-bounds signup', (value) => {
    expect(signupSchema.safeParse(value).success).toBe(false);
  });
  it('requires fixed recovery destinations and an explicit reset capability', () => {
    expect(
      authBodies['request-password-reset'].safeParse({
        email: signup.email,
        redirectTo: '/reset-password',
      }).success,
    ).toBe(true);
    expect(
      authBodies['request-password-reset'].safeParse({
        email: signup.email,
        redirectTo: 'https://evil.test',
      }).success,
    ).toBe(false);
    expect(
      authBodies['reset-password'].safeParse({
        token: '',
        newPassword: signup.password,
      }).success,
    ).toBe(false);
    expect(
      authBodies['reset-password'].safeParse({
        token: 'synthetic',
        newPassword: signup.password,
      }).success,
    ).toBe(true);
    expect(authBodies['sign-out'].safeParse({ userId: 'forged' }).success).toBe(
      false,
    );
  });
});
