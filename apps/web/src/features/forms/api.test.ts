import { afterEach, expect, it, vi } from 'vitest';
import {
  fetchForms,
  fetchForm,
  createFormRequest,
  saveDraftRequest,
} from './api';
import { formFixture } from '../../../../../packages/contracts/test/form-fixture.ts';
afterEach(() => vi.unstubAllGlobals());
const workspaceId = crypto.randomUUID(),
  id = crypto.randomUUID();
const snapshot = () => ({
  id,
  workspaceId,
  definition: formFixture().definition,
  revision: 1,
  role: 'owner',
  updatedAt: '2026-10-28T00:00:00.000Z',
});
it('validates a private form page and keeps requests same-origin and uncached', async () => {
  const page = {
    workspace: {
      id: workspaceId,
      name: 'QA Agency',
      segment: 'agency',
      role: 'viewer',
    },
    forms: [],
    nextCursor: null,
  };
  const fetcher = vi.fn().mockResolvedValue(Response.json(page));
  vi.stubGlobal('fetch', fetcher);
  expect(await fetchForms(workspaceId)).toEqual(page);
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
  });
});
it('posts the caller’s stable form identity without a blind retry', async () => {
  const form = snapshot();
  const fetcher = vi.fn().mockResolvedValue(Response.json({ form }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    (await createFormRequest(workspaceId, { id, definition: form.definition }))
      .id,
  ).toBe(id);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    id,
    definition: form.definition,
  });
});
it('preserves operation identity on conflict and hides raw server diagnostics', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'DRAFT_CONFLICT', secret: 'private diagnostic' } },
          { status: 409 },
        ),
      ),
  );
  const input = {
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
    definition: formFixture().definition,
  };
  await expect(saveDraftRequest(workspaceId, id, input)).rejects.toMatchObject({
    code: 'conflict',
  });
});
it('rejects malformed successful responses and distinguishes expired authentication', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ form: { ...snapshot(), revision: 'fake' } }),
      ),
  );
  await expect(fetchForm(workspaceId, id)).rejects.toMatchObject({
    code: 'unavailable',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
  await expect(fetchForms(workspaceId)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
});
it('explains oversized drafts before sending a write', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const definition = formFixture().definition;
  definition.pages[0].blocks.push(
    ...Array.from({ length: 30 }, () => ({
      id: crypto.randomUUID(),
      type: 'help' as const,
      text: 'Long text.\n'.repeat(900),
    })),
  );
  await expect(
    saveDraftRequest(workspaceId, id, {
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      definition,
    }),
  ).rejects.toMatchObject({
    code: 'invalid',
    message:
      'This draft is too large. Shorten long text, then try saving again.',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it('preserves the publication operation on a retry and validates returned metadata', async () => {
  const { fetchPublication, publishFormRequest, stopPublicationRequest } =
    await import('./api');
  const input = { versionId: crypto.randomUUID(), expectedRevision: 3 };
  const publication = {
    publicId: crypto.randomUUID(),
    versionId: input.versionId,
    number: 1,
    sourceRevision: 3,
    active: true,
    updatedAt: '2026-10-29T00:00:00.000Z',
  };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ publication }));
  vi.stubGlobal('fetch', fetcher);
  expect(await fetchPublication(workspaceId, id)).toEqual(publication);
  fetcher.mockImplementation(async () =>
    Response.json({
      versionId: input.versionId,
      number: 1,
      sourceRevision: 3,
      publication,
    }),
  );
  await publishFormRequest(workspaceId, id, input);
  await publishFormRequest(workspaceId, id, input);
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
  fetcher.mockResolvedValue(
    Response.json({ publication: { ...publication, active: false } }),
  );
  expect(
    (
      await stopPublicationRequest(workspaceId, id, {
        expectedVersionId: input.versionId,
      })
    )?.active,
  ).toBe(false);
  expect(fetcher.mock.calls[3][1].method).toBe('DELETE');
});
it('classifies a rejected publication as definite validation failure', async () => {
  const { publishFormRequest } = await import('./api');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'INVALID_PUBLICATION' } },
          { status: 422 },
        ),
      ),
  );
  await expect(
    publishFormRequest(workspaceId, id, {
      versionId: crypto.randomUUID(),
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: 'invalid' });
});
