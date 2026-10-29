import { MAX_CSV_BYTES } from '@snapform/contracts/response-csv';
const messages: Record<number, [string, string]> = {
  401: [
    'Sign in to download',
    'Your session has ended. Sign in again to export your responses.',
  ],
  403: [
    'Export unavailable',
    'Your current workspace role does not allow this export.',
  ],
  404: [
    'Version unavailable',
    'This published version or workspace is no longer available to your account.',
  ],
  409: ['Responses changed', 'Refresh the inbox, then try your export again.'],
  422: [
    'Export unavailable',
    'Check the version and export limits: up to 1,000 responses, 1 MiB of stored answers and a 2 MiB CSV. Your saved responses remain available in the inbox.',
  ],
  429: [
    'Give it a moment',
    'You can create three exports per minute. Please try again in a minute.',
  ],
};
export async function formatExportDownload(
  request: Request,
  response: Response,
  stylesheet: string,
): Promise<Response> {
  const match = new URL(request.url).pathname.match(
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/forms\/([A-Fa-f0-9-]{36})\/response-export$/,
  );
  if (
    request.method !== 'GET' ||
    !match ||
    !request.headers.get('Accept')?.includes('text/html')
  )
    return response;
  const size = response.headers.get('Content-Length') || '';
  const disposition = response.headers.get('Content-Disposition') || '';
  const validFile =
    response.status === 200 &&
    response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() ===
      'text/csv' &&
    /^[1-9]\d*$/.test(size) &&
    Number(size) <= MAX_CSV_BYTES &&
    new RegExp(
      `^attachment; filename="snapform-${match[2].toLowerCase()}-v[1-9]\\d*\\.csv"$`,
    ).test(disposition);
  if (validFile) return response;
  await response.body
    ?.cancel()
    .catch(() =>
      console.error(JSON.stringify({ event: 'export_body_release_failed' })),
    );
  const status = response.status >= 400 ? response.status : 502;
  const [title, message] = messages[status] ?? [
    'Download unavailable',
    'The CSV could not be prepared. Please return to the inbox and try again.',
  ];
  const safeStylesheet = stylesheet
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const href =
    status === 401 ? '/login' : `/workspaces/${match[1]}/responses/${match[2]}`;
  const headers = new Headers(response.headers);
  for (const name of [
    'Content-Disposition',
    'Content-Length',
    'Content-Encoding',
    'Transfer-Encoding',
    'Content-Range',
    'ETag',
    'Location',
  ])
    headers.delete(name);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store, no-transform');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  );
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${title} · Snapform</title><link rel="stylesheet" href="${safeStylesheet}"></head><body><a class="skip-link" href="#main">Skip to content</a><header class="topbar"><a class="wordmark" href="/"><span class="brand-symbol" aria-hidden="true">s</span>snapform</a></header><main id="main" class="workspace-home"><div class="workspace-empty export-error"><p class="eyebrow">YOUR RESPONSE EXPORT</p><h1>${title}</h1><p role="alert">${message}</p><a class="button primary compact-button" href="${href}">${status === 401 ? 'Sign in' : 'Back to inbox'}</a></div></main></body></html>`,
    { status, headers },
  );
}
