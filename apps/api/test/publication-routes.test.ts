import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { compilePublication } from '@snapform/contracts/publication';
import { matchPublicationRoute } from '../src/publication.ts';
import { formFixture } from '../../../packages/contracts/test/form-fixture.ts';
import { sessionCookie } from './session-cookie.ts';
it('refuses file questions with the publication compiler inside workerd', () => {
  const { definition } = formFixture();
  expect(compilePublication(definition).ok).toBe(true);
  const fileId = crypto.randomUUID();
  definition.pages[0].blocks.push({
    id: fileId,
    type: 'file',
    label: 'Upload your brief',
    description: '',
    required: false,
    aiEnabled: false,
    maxFiles: 1,
  });
  const result = compilePublication(definition);
  expect(result.ok).toBe(false);
  if (!result.ok)
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'FILE_COLLECTION_UNAVAILABLE',
        targetId: fileId,
      }),
    );
});
const workspaceId = crypto.randomUUID(),
  formId = crypto.randomUUID();
const path = `/api/v1/workspaces/${workspaceId}/forms/${formId}/publication`;
const url = `http://127.0.0.1:5173${path}`;
it('matches only complete UUID-scoped publication resources', () => {
  expect(matchPublicationRoute(path)).toEqual({ workspaceId, formId });
  for (const suffix of ['/', '/unpublish', '/extra'])
    expect(matchPublicationRoute(path + suffix)).toBeNull();
  expect(matchPublicationRoute(path.replace(formId, 'missing'))).toBeNull();
});
it('requires verified identity for publication reads and mutations', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    const response = await SELF.fetch(url, {
      method,
      ...(method === 'GET'
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
});
it('bounds publication and unpublication input before database access', async () => {
  for (const method of ['POST', 'DELETE']) {
    expect(
      (
        await SELF.fetch(url, {
          method,
          headers: { Cookie: sessionCookie },
          body: 'plain',
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await SELF.fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
          },
          body: JSON.stringify({ value: 'x'.repeat(17000) }),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await SELF.fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://evil.test',
          },
          body: '{}',
        })
      ).status,
    ).toBe(403);
  }
});
