import { httpServerHandler } from 'cloudflare:node';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { briefSchema } from '@snapform/contracts';
import { authRoutes } from './auth-routes.ts';
import { requestScope } from './request-context.ts';
import { publicFormRoutes } from './public-form.ts';
import { intakeConfigRoutes } from './intake-config.ts';
import { intakeRoutes } from './intake-routes.ts';
import { authFailure, checkAuthRequest } from './auth-boundary.ts';
import type { AuthEnvironment } from './environment.ts';

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Request-Id': crypto.randomUUID(),
  });
  next();
});
app.use(authRoutes);
app.use(publicFormRoutes);
app.use(intakeRoutes);
app.use(intakeConfigRoutes);
app.post(
  '/api/v1/brief/review',
  (req, res, next) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: { code: 'JSON_REQUIRED' } });
      return;
    }
    next();
  },
  express.json({ limit: 8192, strict: true, inflate: false }),
  (req, res) => {
    const result = briefSchema.safeParse(req.body);
    if (!result.success) {
      res.status(422).json({ error: { code: 'INVALID_BRIEF' } });
      return;
    }
    res.json({ brief: result.data });
  },
);
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND' } });
});
const handleError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const type =
    typeof error === 'object' && error !== null && 'type' in error
      ? error.type
      : '';
  const status =
    type === 'entity.too.large'
      ? 413
      : type === 'entity.parse.failed'
        ? 400
        : type === 'encoding.unsupported' || type === 'charset.unsupported'
          ? 415
          : 500;
  res.status(status).json({
    error: { code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST' },
  });
};
app.use(handleError);
app.listen(3000);
const serve = httpServerHandler({ port: 3000 }).fetch;
if (!serve)
  throw new Error(
    'The Cloudflare HTTP bridge did not provide a fetch handler.',
  );
export default {
  async fetch(
    request: Request<unknown, IncomingRequestCfProperties>,
    environment: Env & AuthEnvironment,
    context: ExecutionContext,
  ) {
    const origin = request.headers.get('origin');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      (request.headers.get('sec-fetch-site') === 'cross-site' ||
        (origin && origin !== new URL(request.url).origin))
    ) {
      return Response.json(
        { error: { code: 'ORIGIN_REJECTED' } },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Request-Id': crypto.randomUUID(),
          },
        },
      );
    }
    if (new URL(request.url).pathname.startsWith('/api/auth/')) {
      const checked = await checkAuthRequest(
        request,
        environment.AUTH_ALLOWED_RECIPIENT,
      );
      if (checked instanceof Response) return checked;
      if (request.method === 'POST') {
        const key = request.headers.get('cf-connecting-ip') || 'local';
        if (!(await environment.AUTH_RATE_LIMIT.limit({ key })).success)
          return authFailure('RATE_LIMITED', 429);
      }
      request = checked;
    }
    return requestScope.run(
      { environment, context, origin: new URL(request.url).origin },
      () => serve(request, environment, context),
    );
  },
};
