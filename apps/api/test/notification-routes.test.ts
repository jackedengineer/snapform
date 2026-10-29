import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
it('requires verified authentication for notification reads and settings writes', async () => {
  const url = `https://snapform.jacked.dev/api/v1/workspaces/${crypto.randomUUID()}/forms/${crypto.randomUUID()}/notifications`;
  for (const method of ['GET', 'PUT']) {
    const response = await SELF.fetch(url, {
      method,
      headers: method === 'PUT' ? { 'Content-Type': 'application/json' } : {},
      ...(method === 'PUT'
        ? { body: JSON.stringify({ enabled: true, expectedRevision: 0 }) }
        : {}),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
  }
});
