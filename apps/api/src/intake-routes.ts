import { Router, json } from 'express';
import type { Request, Response } from 'express';
import { openDatabase } from '@snapform/database';
import { startIntake, getIntake } from '@snapform/database/intake';
import {
  createIntakeSchema,
  intakeEnvelopeSchema,
} from '@snapform/contracts/intake';
import type { IntakeSession } from '@snapform/contracts/intake';
import { compileDefinition } from '@snapform/contracts/compile';
import { requestScope } from './request-context.ts';
import { intakeAuthorizationHash } from './intake-capability.ts';
import { verifyIntakeChallenge } from './intake-challenge.ts';
type Route =
  | { kind: 'start'; publicId: string }
  | { kind: 'session'; publicId: string; id: string };
const pattern =
  /^\/api\/v1\/public\/forms\/([A-Fa-f0-9-]{36})\/sessions(?:\/([A-Fa-f0-9-]{36}))?$/;
const identity = createIntakeSchema.shape.id;
export function matchIntakeRoute(path: string): Route | null {
  const match = path.match(pattern);
  if (!match) return null;
  const publicId = identity.safeParse(match[1]);
  if (!publicId.success) return null;
  if (!match[2]) return { kind: 'start', publicId: publicId.data };
  const id = identity.safeParse(match[2]);
  return id.success
    ? { kind: 'session', publicId: publicId.data, id: id.data }
    : null;
}
export const intakeRoutes = Router();
const body = json({ limit: 16384, strict: true, inflate: false });
intakeRoutes.use((req, res, next) => {
  if (matchIntakeRoute(req.path)?.kind !== 'start' || req.method !== 'POST')
    return next();
  if (!req.is('application/json')) {
    res.status(415).json({ error: { code: 'JSON_REQUIRED' } });
    return;
  }
  body(req, res, next);
});
intakeRoutes.use(async (req, res, next) => {
  const route = matchIntakeRoute(req.path);
  if (!route) return next();
  const method = route.kind === 'start' ? 'POST' : 'GET';
  if (req.method !== method) {
    res.setHeader('Allow', method);
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  const scope = requestScope.getStore();
  if (!scope) throw new Error('Request context is required.');
  const completion = handleIntake(req, res, route, scope);
  scope.context.waitUntil(
    completion.catch(() =>
      console.error(
        JSON.stringify({
          event: 'intake_request_failed',
          requestId: res.getHeader('X-Request-Id'),
        }),
      ),
    ),
  );
  try {
    await completion;
  } catch {
    if (res.headersSent) res.destroy();
    else next(new Error('Intake request could not be completed.'));
  }
});
function validateSession(session: IntakeSession) {
  if (!compileDefinition(session.definition).ok)
    throw new Error('INTAKE_UNAVAILABLE');
  if (
    session.definition.pages.some((page) =>
      page.blocks.some((block) => block.type === 'file'),
    )
  )
    throw new Error('FILE_COLLECTION_UNAVAILABLE');
  return session;
}
async function handleIntake(
  req: Request,
  res: Response,
  route: Route,
  scope: NonNullable<ReturnType<typeof requestScope.getStore>>,
) {
  const settings = scope.environment;
  const limiter =
    route.kind === 'start'
      ? settings.INTAKE_START_RATE_LIMIT
      : settings.PUBLIC_READ_RATE_LIMIT;
  if (
    !(await limiter.limit({ key: req.get('cf-connecting-ip') || 'local' }))
      .success
  ) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: { code: 'RATE_LIMITED' } });
    return;
  }
  const hash = await intakeAuthorizationHash(req.get('authorization'));
  if (!hash) {
    res.status(401).json({ error: { code: 'INTAKE_UNAVAILABLE' } });
    return;
  }
  const input =
    route.kind === 'start' ? createIntakeSchema.safeParse(req.body) : null;
  if (input && !input.success) {
    res.status(422).json({ error: { code: 'INVALID_INTAKE_REQUEST' } });
    return;
  }
  if (!settings.DATABASE_URL) {
    res.status(503).json({ error: { code: 'INTAKE_UNAVAILABLE' } });
    return;
  }
  if (input?.success) {
    const challenge = await verifyIntakeChallenge({
      secret: settings.TURNSTILE_SECRET_KEY || '',
      origin: scope.origin,
      mode: settings.SNAPFORM_ENV,
      token: input.data.challengeToken,
    });
    if (challenge !== 'verified') {
      res.status(challenge === 'rejected' ? 403 : 503).json({
        error: {
          code:
            challenge === 'rejected'
              ? 'CHALLENGE_REJECTED'
              : 'CHALLENGE_UNAVAILABLE',
        },
      });
      return;
    }
  }
  const { db, close } = await openDatabase(settings.DATABASE_URL);
  try {
    const session =
      route.kind === 'start' && input?.success
        ? await db.transaction(async (tx) =>
            validateSession(
              await startIntake(tx, route.publicId, input.data.id, hash),
            ),
          )
        : route.kind === 'session'
          ? validateSession(await getIntake(db, route.publicId, route.id, hash))
          : null;
    if (!session) throw new Error('INTAKE_UNAVAILABLE');
    res
      .status(route.kind === 'start' ? 201 : 200)
      .json(intakeEnvelopeSchema.parse({ session }));
  } catch (error) {
    if (
      error instanceof Error &&
      ['INTAKE_UNAVAILABLE', 'FILE_COLLECTION_UNAVAILABLE'].includes(
        error.message,
      )
    )
      res
        .status(error.message === 'INTAKE_UNAVAILABLE' ? 404 : 503)
        .json({ error: { code: error.message } });
    else throw error;
  } finally {
    await close();
  }
}
