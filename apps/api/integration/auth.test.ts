import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase } from '@snapform/database';
import type { Transaction } from '@snapform/database';
import { user, account } from '@snapform/database/schema';
import { createAuth } from '../src/auth.ts';

const runtimeURL = process.env.DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
if (!runtimeURL || !authSecret)
  throw new Error(
    'Configure the ignored runtime environment before auth integration tests.',
  );
const password = 'Synthetic-QA-passphrase-27';
const settings = {
  baseURL: 'http://127.0.0.1:5173',
  secret: authSecret,
};
const headers = new Headers({ Origin: settings.baseURL });

async function rolledBack(run: (tx: Transaction) => Promise<void>) {
  const { db, close } = openDatabase(runtimeURL);
  const rollback = new Error('Rollback synthetic auth fixtures');
  try {
    try {
      await db.transaction(async (tx) => {
        await run(tx);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  } finally {
    await close();
  }
}

describe('Better Auth with the real Neon/Drizzle schema', () => {
  it('hashes passwords and ignores a forged verification claim', async () =>
    rolledBack(async (tx) => {
      const auth = createAuth(tx, settings);
      const email = `${crypto.randomUUID()}@example.invalid`;
      const body = {
        email,
        password,
        name: 'Synthetic QA',
        emailVerified: true,
      };
      const result = await auth.api.signUpEmail({ body, headers });
      const stored = await tx
        .select()
        .from(user)
        .where(eq(user.id, result.user.id));
      expect(stored[0].emailVerified).toBe(false);
      const credentials = await tx
        .select()
        .from(account)
        .where(eq(account.userId, result.user.id));
      expect(credentials[0].password).not.toBe(password);
      expect(credentials[0].password).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
      expect(result.token).toBeNull();
      await expect(
        auth.api.signInEmail({ body: { email, password }, headers }),
      ).rejects.toMatchObject({ body: { code: 'EMAIL_NOT_VERIFIED' } });
    }));
  it('creates an opaque cookie session and revokes it on sign-out', async () =>
    rolledBack(async (tx) => {
      const auth = createAuth(tx, settings);
      const email = `${crypto.randomUUID()}@example.invalid`;
      const signedUp = await auth.api.signUpEmail({
        body: { email, password, name: 'Synthetic QA' },
        headers,
      });
      await tx
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, signedUp.user.id));
      await expect(
        auth.api.signInEmail({
          body: { email, password: 'Wrong-QA-passphrase' },
          headers,
        }),
      ).rejects.toMatchObject({ body: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
      const signedIn = await auth.api.signInEmail({
        body: { email, password },
        headers,
        returnHeaders: true,
      });
      const cookies = signedIn.headers.getSetCookie();
      expect(
        cookies.some(
          (value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value),
        ),
      ).toBe(true);
      const sessionHeaders = new Headers({
        Origin: settings.baseURL,
        Cookie: cookies.map((value) => value.split(';')[0]).join('; '),
      });
      expect(
        (await auth.api.getSession({ headers: sessionHeaders }))?.user.id,
      ).toBe(signedUp.user.id);
      await auth.api.signOut({ headers: sessionHeaders });
      expect(await auth.api.getSession({ headers: sessionHeaders })).toBeNull();
    }));
  it('verifies email, consumes reset links once and revokes older sessions', async () =>
    rolledBack(async (tx) => {
      const messages: { kind: string; url: string }[] = [];
      const auth = createAuth(tx, {
        ...settings,
        sendEmail: async (message) => {
          messages.push(message);
        },
      });
      const email = `${crypto.randomUUID()}@example.invalid`;
      await auth.api.signUpEmail({
        body: { email, password, name: 'Recovery QA', callbackURL: '/login' },
        headers,
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].kind).toBe('verify');
      const verified = await auth.handler(new Request(messages[0].url));
      expect(verified.status).toBe(302);
      expect(
        new URL(verified.headers.get('location')!, settings.baseURL).pathname,
      ).toBe('/login');
      const signedIn = await auth.api.signInEmail({
        body: { email, password },
        headers,
        returnHeaders: true,
      });
      const sessionHeaders = new Headers({
        Cookie: signedIn.headers
          .getSetCookie()
          .map((value) => value.split(';')[0])
          .join('; '),
        Origin: settings.baseURL,
      });
      expect(
        await auth.api.getSession({ headers: sessionHeaders }),
      ).not.toBeNull();
      await auth.api.requestPasswordReset({
        body: { email, redirectTo: '/reset-password' },
        headers,
      });
      expect(messages.at(-1)?.kind).toBe('reset');
      const token = new URL(messages.at(-1)!.url).pathname.split('/').at(-1)!;
      const newPassword = 'New-Synthetic-QA-passphrase-28';
      await auth.api.resetPassword({ body: { token, newPassword }, headers });
      expect(await auth.api.getSession({ headers: sessionHeaders })).toBeNull();
      await expect(
        auth.api.resetPassword({ body: { token, newPassword }, headers }),
      ).rejects.toMatchObject({ body: { code: 'INVALID_TOKEN' } });
      await expect(
        auth.api.signInEmail({ body: { email, password }, headers }),
      ).rejects.toMatchObject({ body: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
      expect(
        (
          await auth.api.signInEmail({
            body: { email, password: newPassword },
            headers,
          })
        ).user.emailVerified,
      ).toBe(true);
    }));
});
