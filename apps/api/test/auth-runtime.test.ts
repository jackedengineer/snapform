import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { openDatabase } from '@snapform/database';
import { createAuth } from '../src/auth.ts';
import type { AuthEnvironment } from '../src/environment.ts';
const settings = env as AuthEnvironment;

it('runs real Better Auth and Neon transactions inside workerd', async () => {
  const { db, close } = await openDatabase(settings.DATABASE_URL);
  const rollback = new Error('Rollback the Worker auth fixture');
  try {
    try {
      await db.transaction(async (tx) => {
        const auth = createAuth(tx, {
          baseURL: 'https://snapform.test',
          secret: settings.BETTER_AUTH_SECRET,
        });
        const headers = new Headers({ Origin: 'https://snapform.test' });
        const email = `${crypto.randomUUID()}@example.invalid`;
        const body = {
          email,
          password: 'Synthetic-QA-passphrase-27',
          name: 'Worker QA',
          emailVerified: true,
        };
        const result = await auth.api.signUpEmail({ body, headers });
        expect(result.user.emailVerified).toBe(false);
        expect(result.token).toBeNull();
        await expect(
          auth.api.signInEmail({ body, headers }),
        ).rejects.toMatchObject({ body: { code: 'EMAIL_NOT_VERIFIED' } });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  } finally {
    await close();
  }
}, 20000);
