import { AsyncLocalStorage } from 'node:async_hooks';
import { Router } from 'express';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { openDatabase } from '@snapform/database';
import { createAuth } from './auth.ts';
import { makeAuthMailer } from './email.ts';
import type { AuthEnvironment } from './environment.ts';

export const requestScope = new AsyncLocalStorage<{
  environment: Env & AuthEnvironment;
  context: ExecutionContext;
}>();
export const authRoutes = Router();
authRoutes.use(async (req, res, next) => {
  if (!(req.path.startsWith('/api/auth/') || req.path === '/api/v1/me'))
    return next();
  if (req.path === '/api/v1/me' && req.method !== 'GET') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  if (req.path === '/api/v1/me' && !req.headers.cookie) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
    return;
  }
  const scope = requestScope.getStore();
  if (!scope) throw new Error('Request context is required.');
  const settings = scope.environment;
  if (
    !settings.DATABASE_URL ||
    !settings.BETTER_AUTH_SECRET ||
    !settings.BETTER_AUTH_URL ||
    !settings.RESEND_API_KEY ||
    !settings.EMAIL_FROM
  ) {
    res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE' } });
    return;
  }
  const { db, close } = openDatabase(settings.DATABASE_URL);
  try {
    const send = makeAuthMailer({
      apiKey: settings.RESEND_API_KEY,
      from: settings.EMAIL_FROM,
      origin: settings.BETTER_AUTH_URL,
      allowedRecipient: settings.AUTH_ALLOWED_RECIPIENT,
    });
    const auth = createAuth(db, {
      baseURL: settings.BETTER_AUTH_URL,
      secret: settings.BETTER_AUTH_SECRET,
      sendEmail: async (message) => {
        try {
          await send(message);
        } catch (error) {
          console.error(
            JSON.stringify({ event: 'auth_email_failed', kind: message.kind }),
          );
          throw error;
        }
      },
      backgroundTask: (promise) => scope.context.waitUntil(promise),
    });
    if (req.path === '/api/v1/me') {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (!session || !session.user.emailVerified) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
        return;
      }
      const { id, name, email } = session.user;
      res.json({ user: { id, name, email } });
    } else {
      await toNodeHandler(auth)(req, res);
    }
  } finally {
    await close();
  }
});
