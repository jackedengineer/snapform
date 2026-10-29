import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
it('requires authentication for response lists, details and malformed cursor requests', async () => {
  const path = `https://snapform.jacked.dev/api/v1/workspaces/${crypto.randomUUID()}/forms/${crypto.randomUUID()}/responses`;
  for (const url of [
    path,
    `${path}/${crypto.randomUUID()}`,
    `${path}?cursor=not-json`,
    `${path}?role=owner`,
  ]) {
    const response = await SELF.fetch(url);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
});
