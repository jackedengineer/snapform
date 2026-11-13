import { Router } from 'express';
import type { Request, Response } from 'express';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { openDatabase } from '@snapform/database';
import { createAuth } from './auth.ts';
import { makeAuthMailer } from './email.ts';
import { requestScope } from './request-context.ts';
import {
  isPrivatePath,
  privateBody,
  handlePrivateRequest,
} from './private-routes.ts';

const signedToken =
  /^[A-Za-z0-9_-]{1,256}\.[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
// Mirrors better-call's signed-cookie reader: the first cookie with the name
// wins and its value is URL-decoded before `${token}.${base64 HMAC}` checks.
// Better Auth still verifies the signature and stored session afterwards.
function hasSessionCookie(
  header: string | undefined,
  authUrl: string | undefined,
) {
  const secure =
    authUrl !== undefined &&
    URL.canParse(authUrl) &&
    new URL(authUrl).protocol === 'https:';
  const name = (secure ? '__Secure-' : '') + 'snapform.session_token';
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return (
      /^(?:[A-Za-z0-9_.+/=-]|%2[BbFf]|%3[Dd]){1,512}$/.test(value) &&
      signedToken.test(
        value.replace(/%2B/gi, '+').replace(/%2F/gi, '/').replace(/%3D/gi, '='),
      )
    );
  }
  return false;
}

export const authRoutes = Router();
// Cheap checks precede body parsing and every private database connection.
authRoutes.use(async (req, res, next) => {
  if (!isPrivatePath(req.path)) return next();
  const scope = requestScope.getStore();
  if (!scope) throw new Error('Request context is required.');
  const settings = scope.environment;
  if (!hasSessionCookie(req.headers.cookie, settings.BETTER_AUTH_URL)) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
    return;
  }
  const key = req.get('cf-connecting-ip') || 'local';
  if (!(await settings.PRIVATE_IP_RATE_LIMIT.limit({ key })).success) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: { code: 'RATE_LIMITED' } });
    return;
  }
  next();
});
authRoutes.use(privateBody);
authRoutes.use(async (req, res, next) => {
  if (!(req.path.startsWith('/api/auth/') || isPrivatePath(req.path)))
    return next();
  const scope = requestScope.getStore();
  if (!scope) throw new Error('Request context is required.');
  const completion = handleAuth(req, res, scope);
  // Node's HTTP bridge can return a response before Express async cleanup finishes.
  scope.context.waitUntil(
    completion.catch(() => {
      console.error(
        JSON.stringify({
          event: 'auth_request_failed',
          requestId: res.getHeader('X-Request-Id'),
        }),
      );
    }),
  );
  try {
    await completion;
  } catch {
    if (res.headersSent) res.destroy();
    else next(new Error('Authentication request could not be completed.'));
  }
});
async function handleAuth(
  req: Request,
  res: Response,
  scope: NonNullable<ReturnType<typeof requestScope.getStore>>,
) {
  if (req.path === '/api/auth/sign-out' && !req.headers.cookie) {
    res.json({ success: true });
    return;
  }
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
  const { db, close } = await openDatabase(settings.DATABASE_URL);
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
    if (isPrivatePath(req.path)) {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (!session || !session.user.emailVerified) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
        return;
      }
      const { id, name, email } = session.user;
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
        !(await settings.WRITE_RATE_LIMIT.limit({ key: id })).success
      ) {
        res.setHeader('Retry-After', '60');
        res.status(429).json({ error: { code: 'RATE_LIMITED' } });
        return;
      }
      await handlePrivateRequest(req, res, db, { id, name, email });
    } else {
      await toNodeHandler(auth)(req, res);
    }
  } finally {
    await close();
  }
}
