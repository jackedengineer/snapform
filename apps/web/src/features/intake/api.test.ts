import { afterEach, expect, it, vi } from 'vitest';
import {
  readPublicForm,
  startIntakeRequest,
  writeIntakeRequest,
  IntakeRequestError,
} from './api';
import { newIntakeIdentity } from './identity';
import { formFixture } from '../../../../../packages/contracts/test/form-fixture.ts';
afterEach(() => vi.unstubAllGlobals());
const publicId = crypto.randomUUID(),
  identity = newIntakeIdentity();
it('uses anonymous uncached requests and keeps respondent credentials out of URLs and bodies', async () => {
  const session = {
    id: identity.id,
    publicId,
    versionId: crypto.randomUUID(),
    definition: formFixture().definition,
    revision: 1,
    answers: {},
    status: 'collecting',
    expiresAt: '2026-11-05T00:00:00.000Z',
  };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ session }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    await startIntakeRequest(publicId, identity, 'synthetic-challenge'),
  ).toEqual(session);
  expect(fetcher.mock.calls[0][0]).not.toContain(identity.capability);
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    headers: { Authorization: 'Bearer ' + identity.capability },
  });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    id: identity.id,
    challengeToken: 'synthetic-challenge',
  });
});
it('sends a stable revisioned operation once and refuses an unrelated receipt', async () => {
  const input = {
    operationId: crypto.randomUUID(),
    expectedRevision: 2,
    answers: {},
  };
  const receipt = {
    operationId: input.operationId,
    revision: 3,
    currentRevision: 3,
    status: 'submitted',
  };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ receipt }));
  vi.stubGlobal('fetch', fetcher);
  expect(await writeIntakeRequest(publicId, identity, input, 'submit')).toEqual(
    receipt,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toMatch(/\/submission$/);
  fetcher.mockResolvedValue(
    Response.json({
      receipt: { ...receipt, operationId: crypto.randomUUID() },
    }),
  );
  await expect(
    writeIntakeRequest(publicId, identity, input, 'submit'),
  ).rejects.toBeInstanceOf(IntakeRequestError);
});
it('returns useful bounded failure categories without leaking raw diagnostics', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'INTAKE_CONFLICT', secret: 'raw secret' } },
          { status: 409 },
        ),
      ),
  );
  await expect(
    writeIntakeRequest(
      publicId,
      identity,
      { operationId: crypto.randomUUID(), expectedRevision: 1, answers: {} },
      'save',
    ),
  ).rejects.toMatchObject({ code: 'conflict' });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('raw secret')));
  await expect(readPublicForm(publicId)).rejects.toMatchObject({
    message:
      'We couldn’t confirm that request. Your answers have not been cleared.',
  });
});
