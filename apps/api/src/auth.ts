import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { Database, Transaction } from '@snapform/database';
import * as schema from '@snapform/database/schema';
import type { AuthMessage } from './email.ts';

export function createAuth(
  db: Database | Transaction,
  config: {
    baseURL: string;
    secret: string;
    sendEmail?: (message: AuthMessage) => Promise<void>;
    backgroundTask?: (promise: Promise<unknown>) => void;
  },
) {
  const origin = new URL(config.baseURL);
  if (
    config.secret.length < 32 ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== 'https:' &&
      !['http://localhost', 'http://127.0.0.1'].includes(
        `${origin.protocol}//${origin.hostname}`,
      ))
  ) {
    throw new Error(
      'A trusted application origin and secure auth secret are required.',
    );
  }
  return betterAuth({
    appName: 'Snapform',
    baseURL: origin.origin,
    secret: config.secret,
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    trustedOrigins: [origin.origin],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 900,
      revokeSessionsOnPasswordReset: true,
      ...(config.sendEmail
        ? {
            sendResetPassword: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => config.sendEmail?.({ kind: 'reset', to: user.email, url }),
          }
        : {}),
    },
    ...(config.sendEmail
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: false,
            expiresIn: 900,
            autoSignInAfterVerification: false,
            sendVerificationEmail: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => config.sendEmail?.({ kind: 'verify', to: user.email, url }),
          },
        }
      : {}),
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { disableImplicitLinking: true },
    },
    advanced: {
      cookiePrefix: 'snapform',
      ...(config.backgroundTask
        ? { backgroundTasks: { handler: config.backgroundTask } }
        : {}),
      useSecureCookies: origin.protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    logger: { disabled: true },
    telemetry: { enabled: false },
  });
}
