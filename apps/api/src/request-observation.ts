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
