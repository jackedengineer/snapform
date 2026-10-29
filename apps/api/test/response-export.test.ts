import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
it('requires verified authentication for response exports', async () => {
  const url = `https://snapform.jacked.dev/api/v1/workspaces/${crypto.randomUUID()}/forms/${crypto.randomUUID()}/response-export?versionId=${crypto.randomUUID()}`;
  const response = await SELF.fetch(url);
  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
