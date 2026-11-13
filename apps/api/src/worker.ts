import { httpServerHandler } from 'cloudflare:node';
import express from 'express';
import { briefSchema } from '@snapform/contracts';
import { authRoutes } from './auth-routes.ts';
import { requestScope } from './request-context.ts';
import {
  handleRequestError,
  requestObservation,
} from './request-observation.ts';
import { publicFormRoutes } from './public-form.ts';
import { intakeConfigRoutes } from './intake-config.ts';
import { intakeRoutes } from './intake-routes.ts';
import { authFailure, checkAuthRequest } from './auth-boundary.ts';
import type { AuthEnvironment } from './environment.ts';
import {
  handleRazorpayWebhook,
  razorpayWebhookPath,
} from './billing-webhook.ts';

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const started = performance.now(),
    requestId = crypto.randomUUID();
  let observed = false;
  const observe = () => {
    if (observed) return;
    observed = true;
    console.log(
      JSON.stringify(
        requestObservation({
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: performance.now() - started,
          completed: res.writableFinished,
        }),
      ),
    );
  };
  res.once('finish', observe);
  res.once('close', observe);
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Request-Id': requestId,
  });
  next();
});
app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));
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
app.use(handleRequestError);
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
    if (new URL(request.url).pathname === '/api/v1/hooks/resend') {
      const key =
        'provider-receipt:' +
        (request.headers.get('cf-connecting-ip') || 'local');
      if (!(await environment.PUBLIC_READ_RATE_LIMIT.limit({ key })).success)
        return Response.json(
          { error: { code: 'RATE_LIMITED' } },
          {
            status: 429,
            headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
          },
        );
      try {
        return await environment.JOBS.fetch(request);
      } catch {
        console.error(
          JSON.stringify({ event: 'provider_receipt_forward_failed' }),
        );
        return Response.json(
          { error: { code: 'UNAVAILABLE' } },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }
    // Raw body and provider signature, so this never passes through Express parsers.
    if (new URL(request.url).pathname === razorpayWebhookPath)
      return handleRazorpayWebhook(request, environment);
    if (new URL(request.url).pathname.startsWith('/api/auth/')) {
      const checked = await checkAuthRequest(
        request,
        environment.AUTH_ALLOWED_RECIPIENT,
      );
      if (checked instanceof Response) return checked;
      // Emailed link callbacks also open a database connection.
      const key = request.headers.get('cf-connecting-ip') || 'local';
      if (!(await environment.AUTH_RATE_LIMIT.limit({ key })).success)
        return authFailure('RATE_LIMITED', 429);
      request = checked;
    }
    return requestScope.run(
      { environment, context, origin: new URL(request.url).origin },
      () => serve(request, environment, context),
    );
  },
};
