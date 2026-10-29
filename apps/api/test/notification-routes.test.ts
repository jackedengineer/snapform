import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
it('requires verified authentication for notification reads and settings writes', async () => {
  const url = `https://snapform.jacked.dev/api/v1/workspaces/${crypto.randomUUID()}/forms/${crypto.randomUUID()}/notifications`;
  for (const method of ['GET', 'PUT', 'POST']) {
    const response = await SELF.fetch(url, {
      method,
      headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
      ...(method !== 'GET'
        ? {
            body: JSON.stringify(
              method === 'PUT'
                ? { enabled: true, expectedRevision: 0 }
                : { deliveryId: crypto.randomUUID(), expectedAttempts: 0 },
            ),
          }
        : {}),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
  }
});
