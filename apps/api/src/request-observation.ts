import type { ErrorRequestHandler } from 'express';
const methods = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function routeFamily(path: string) {
  if (path === '/api/v1/health') return 'health';
  if (path.startsWith('/api/auth/')) return 'auth';
  if (path === '/api/v1/brief/review') return 'brief';
  if (
    path === '/api/v1/public/intake-config' ||
    /^\/api\/v1\/public\/forms\/[^/]+\/sessions(?:\/|$)/.test(path)
  )
    return 'intake';
  if (/^\/api\/v1\/public\/forms\/[0-9a-f-]{36}$/i.test(path))
    return 'public-form';
  if (/^\/api\/v1\/workspaces(?:\/|$)/.test(path)) {
    if (/\/webhook(?:\/|$)/.test(path)) return 'webhook';
    if (/\/responses(?:\/|$)/.test(path)) return 'response';
    if (/\/forms(?:\/|$)/.test(path)) return 'form';
    return 'workspace';
  }
  return 'unknown';
}
// Allowlist fields; never serialize a request, response, path, header or error.
export function requestObservation(input: {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  completed: boolean;
}) {
  return {
    event: 'http_request_completed',
    requestId: uuid.test(input.requestId) ? input.requestId : 'unavailable',
    method: methods.has(input.method) ? input.method : 'OTHER',
    route: routeFamily(input.path),
    status:
      Number.isInteger(input.status) &&
      input.status >= 100 &&
      input.status <= 599
        ? input.status
        : 500,
    durationMs: Number.isFinite(input.durationMs)
      ? Math.max(0, Math.round(input.durationMs))
      : 0,
    completed: input.completed,
  };
}
// Static API path segments; anything else is an identifier, token or unknown.
const segments = new Set(
  'api v1 auth me health brief review public forms sessions submission intake-config workspaces deletions cancel draft publication notifications responses response-export retention webhook secret preview send deliveries hooks resend sign-up sign-in email sign-out send-verification-email request-password-reset reset-password verify-email'.split(
    ' ',
  ),
);
function routeTemplate(path: string) {
  const parts = path.split('/');
  if (parts[0] !== '' || parts.length > 12) return 'unknown';
  return parts
    .map((part, index) =>
      index === 0 || segments.has(part)
        ? part
        : uuid.test(part)
          ? ':id'
          : ':value',
    )
    .join('/');
}
function errorClass(value: unknown) {
  if (typeof value !== 'object' || value === null) return 'NonError';
  const type: unknown = value.constructor;
  return typeof type === 'function' && /^[A-Za-z_$][\w$]{0,63}$/.test(type.name)
    ? type.name
    : 'Unknown';
}
// Messages and stacks may carry SQL parameters or answers; keep only class
// names, upper-snake application codes and short driver codes.
export function failureObservation(input: {
  requestId: string;
  method: string;
  path: string;
  error: unknown;
  responseStarted: boolean;
  status?: number;
}) {
  const chain: unknown[] = [];
  for (
    let current: unknown = input.error;
    chain.length < 4 && current !== undefined && current !== null;
    current =
      typeof current === 'object' && 'cause' in current
        ? current.cause
        : undefined
  )
    chain.push(current);
  const code = chain.find(
    (item): item is Error =>
      item instanceof Error && /^[A-Z][A-Z0-9_]{2,63}$/.test(item.message),
  )?.message;
  const driverCode = chain
    .map((item) =>
      typeof item === 'object' && item !== null && 'code' in item
        ? item.code
        : undefined,
    )
    .find(
      (item): item is string =>
        typeof item === 'string' && /^[0-9A-Z_]{2,32}$/.test(item),
    );
  return {
    event: 'http_request_failed',
    requestId: uuid.test(input.requestId) ? input.requestId : 'unavailable',
    method: methods.has(input.method) ? input.method : 'OTHER',
    route: routeTemplate(input.path),
    status: input.status ?? 500,
    responseStarted: input.responseStarted,
    error: errorClass(chain[0]),
    cause: chain.length > 1 ? errorClass(chain[1]) : null,
    code: code ?? 'UNCLASSIFIED',
    driverCode: driverCode ?? null,
  };
}
export const handleRequestError: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  next,
) => {
  const type =
    typeof error === 'object' && error !== null && 'type' in error
      ? error.type
      : '';
  const status = res.headersSent
    ? res.statusCode
    : type === 'entity.too.large'
      ? 413
      : type === 'entity.parse.failed'
        ? 400
        : type === 'encoding.unsupported' || type === 'charset.unsupported'
          ? 415
          : 500;
  if (status === 500 || res.headersSent)
    console.error(
      JSON.stringify(
        failureObservation({
          requestId: String(res.getHeader('X-Request-Id') ?? ''),
          method: req.method,
          path: req.path,
          error,
          responseStarted: res.headersSent,
          status,
        }),
      ),
    );
  if (res.headersSent) {
    // Forwarding the error would make Express print the raw object. Close the
    // started response, then finish the chain without an error.
    res.destroy();
    next();
    return;
  }
  res.status(status).json({
    error: { code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST' },
  });
};
