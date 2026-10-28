import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { Database, Transaction } from '@snapform/database';
import * as schema from '@snapform/database/schema';

export function createAuth(
  db: Database | Transaction,
  config: { baseURL: string; secret: string },
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
    },
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
      useSecureCookies: origin.protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    logger: { disabled: true },
    telemetry: { enabled: false },
  });
}
