import { expect, it } from 'vitest';
import { formatExportDownload } from './export-download';
const formId = crypto.randomUUID(),
  workspaceId = crypto.randomUUID();
const path = `https://snapform.jacked.dev/api/v1/workspaces/${workspaceId}/forms/${formId}/response-export?versionId=${crypto.randomUUID()}`;
const request = new Request(path, { headers: { Accept: 'text/html' } });
const csv = '\uFEFF"Reference","Version"\r\n"synthetic",1\r\n';
const headers = {
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Length': String(new TextEncoder().encode(csv).length),
  'Content-Disposition': `attachment; filename="snapform-${formId}-v1.csv"`,
};
it('passes only a complete bounded CSV attachment through the native download boundary', async () => {
  const response = new Response(csv, { headers });
  expect(
    await formatExportDownload(request, response, '/assets/styles.css'),
  ).toBe(response);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new TextEncoder().encode(csv),
  );
});
it('turns authorization, rate and size failures into private styled pages without reflecting provider diagnostics', async () => {
  for (const status of [401, 403, 404, 409, 422, 429, 500]) {
    const response = await formatExportDownload(
      request,
      new Response('private synthetic provider diagnostic', {
        status,
        headers: {
          'Content-Type': 'application/json',
          ETag: 'private-digest',
          'X-Request-Id': 'owned-request',
          'Set-Cookie': 'qa=deleted; Max-Age=0; HttpOnly',
        },
      }),
      '/assets/styles.css',
    );
    expect(response.status).toBe(status);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get('ETag')).toBeNull();
    expect(response.headers.get('Content-Disposition')).toBeNull();
    expect(response.headers.get('X-Request-Id')).toBe('owned-request');
    expect(response.headers.get('Set-Cookie')).toContain('qa=deleted');
    const html = await response.text();
    expect(html).toContain('/assets/styles.css');
    expect(html).not.toContain('private synthetic provider diagnostic');
    expect(html).not.toContain('<script');
    if (status === 429) expect(html).toContain('three exports per minute');
  }
});
it('rejects unexpected HTML, empty files, oversized files, partial files and redirects as failed downloads', async () => {
  for (const response of [
    new Response(csv, {
      headers: { ...headers, 'Content-Type': 'text/csv-not-a-type' },
    }),
    new Response('<script>bad()</script>', {
      headers: { 'Content-Type': 'text/html' },
    }),
    new Response('', { headers: { ...headers, 'Content-Length': '0' } }),
    new Response('synthetic', {
      headers: { ...headers, 'Content-Length': '2097153' },
    }),
    new Response(csv, { status: 206, headers }),
    new Response(null, {
      status: 302,
      headers: { Location: 'https://unrelated.invalid' },
    }),
  ]) {
    const formatted = await formatExportDownload(
      request,
      response,
      '/assets/styles.css',
    );
    expect(formatted.status).toBe(502);
    expect(formatted.headers.get('Content-Type')).toContain('text/html');
    expect(formatted.headers.get('Content-Disposition')).toBeNull();
    expect(formatted.headers.get('Location')).toBeNull();
  }
});
it('leaves JSON API clients and unrelated routes unchanged', async () => {
  const response = Response.json(
    { error: { code: 'UNAUTHENTICATED' } },
    { status: 401 },
  );
  expect(
    await formatExportDownload(
      new Request(path),
      response,
      '/assets/styles.css',
    ),
  ).toBe(response);
  expect(
    await formatExportDownload(
      new Request('https://snapform.jacked.dev/api/v1/me', {
        headers: { Accept: 'text/html' },
      }),
      response,
      '/assets/styles.css',
    ),
  ).toBe(response);
});
