import { expect, it, vi, afterEach } from 'vitest';
import { readRecovery, newRecovery } from './recovery';
import { IntakeProgress } from './progress';
import { IntakeRequestError } from './api';
import { formFixture } from '../../../../../packages/contracts/test/form-fixture.ts';
afterEach(() => vi.useRealTimers());
function record() {
  const entry = newRecovery(crypto.randomUUID());
  entry.session = {
    id: entry.identity.id,
    publicId: entry.publicId,
    versionId: crypto.randomUUID(),
    definition: formFixture().definition,
    revision: 1,
    answers: {},
    expiresAt: new Date(entry.expiresAt).toISOString(),
    status: 'collecting',
  };
  return entry;
}
it('rejects expired, unrelated or malformed browser recovery without accepting caller credentials in the session snapshot', () => {
  const entry = record();
  expect(readRecovery(entry, entry.publicId, Date.now())).toEqual(entry);
  expect(readRecovery(entry, crypto.randomUUID(), Date.now())).toBeNull();
  expect(readRecovery(entry, entry.publicId, entry.expiresAt)).toBeNull();
  expect(
    readRecovery(
      { ...entry, identity: { ...entry.identity, capability: 'forged' } },
      entry.publicId,
      Date.now(),
    ),
  ).toBeNull();
  expect(
    readRecovery(
      {
        ...entry,
        session: { ...entry.session, publicId: crypto.randomUUID() },
      },
      entry.publicId,
      Date.now(),
    ),
  ).toBeNull();
});
it('retries the identical in-flight operation and preserves later edits', async () => {
  vi.useFakeTimers();
  const entry = record();
  if (!entry.session) throw new Error('Missing session');
  const field = entry.session.definition.pages[0].blocks.find(
    (block) => block.type === 'long-text',
  );
  if (!field) throw new Error('Missing field');
  const changed = vi.fn(),
    persist = vi.fn().mockResolvedValue(undefined);
  const send = vi
    .fn()
    .mockRejectedValueOnce(new IntakeRequestError('unavailable', 'Offline'))
    .mockImplementation(async (input) => ({
      operationId: input.operationId,
      revision: input.expectedRevision + 1,
      currentRevision: input.expectedRevision + 1,
      status: 'collecting',
    }));
  const progress = new IntakeProgress(entry, {}, { persist, send, changed });
  progress.edit({
    ...entry.session.answers,
    [field.id]: { state: 'value', value: 'First answer' },
  });
  await progress.flush();
  expect(progress.state.status).toBe('offline');
  const pending = structuredClone(progress.state.record.pending);
  progress.edit({ [field.id]: { state: 'value', value: 'Later answer' } });
  await progress.flush();
  expect(send.mock.calls[1][0]).toEqual(pending?.input);
  expect(progress.state.record.session?.answers[field.id]).toEqual({
    state: 'value',
    value: 'Later answer',
  });
  await progress.flush();
  expect(progress.state.status).toBe('saved');
  expect(send.mock.calls[2][0].expectedRevision).toBe(2);
  progress.close();
});
it('honors rate-limit retry delays without erasing unsent input', async () => {
  vi.useFakeTimers();
  const entry = record();
  if (!entry.session) throw new Error('Missing session');
  const field = entry.session.definition.pages[0].blocks.find(
    (block) => block.type === 'long-text',
  );
  if (!field) throw new Error('Missing field');
  const send = vi
    .fn()
    .mockRejectedValue(new IntakeRequestError('rate-limited', 'Wait'));
  const progress = new IntakeProgress(
    entry,
    {},
    { persist: async () => {}, send, changed: () => {} },
  );
  progress.edit({ [field.id]: { state: 'value', value: 'Keep this' } });
  await progress.flush();
  await progress.flush();
  expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  await progress.flush();
  expect(send.mock.calls.length).toBeGreaterThan(1);
  expect(progress.state.record.session?.answers[field.id]).toEqual({
    state: 'value',
    value: 'Keep this',
  });
  progress.close();
});

it('reports unavailable native browser recovery instead of pretending to persist', async () => {
  const { putRecovery } = await import('./storage');
  await expect(putRecovery(record())).rejects.toThrow(
    'Browser recovery is unavailable',
  );
});

it('keeps an uncertain submission frozen and retries the same final operation', async () => {
  const entry = record();
  if (!entry.session) throw new Error('Missing session');
  const send = vi
    .fn()
    .mockRejectedValueOnce(
      new IntakeRequestError('unavailable', 'Lost receipt'),
    )
    .mockImplementation(async (input) => ({
      operationId: input.operationId,
      revision: 2,
      currentRevision: 2,
      status: 'submitted',
    }));
  const progress = new IntakeProgress(
    entry,
    {},
    { persist: async () => {}, send, changed: () => {} },
  );
  expect(await progress.submit()).toBe(false);
  const pending = structuredClone(progress.state.record.pending);
  progress.edit({
    [crypto.randomUUID()]: {
      state: 'value',
      value: 'Must not replace uncertain submission',
    },
  });
  expect(progress.state.record.session?.answers).toEqual({});
  await progress.flush();
  expect(send.mock.calls[1][0]).toEqual(pending?.input);
  expect(progress.state.status).toBe('submitted');
  await progress.close();
});

it('releases a definitely rejected submission when the respondent corrects it', async () => {
  const entry = record();
  if (!entry.session) throw new Error('Missing session');
  const field = entry.session.definition.pages[0].blocks.find(
    (block) => block.type === 'long-text',
  );
  if (!field) throw new Error('Missing field');
  const send = vi
    .fn()
    .mockRejectedValueOnce(
      new IntakeRequestError('invalid', 'Correct the response'),
    )
    .mockImplementation(async (input) => ({
      operationId: input.operationId,
      revision: 2,
      currentRevision: 2,
      status: 'collecting',
    }));
  const progress = new IntakeProgress(
    entry,
    {},
    { persist: async () => {}, send, changed: () => {} },
  );
  await progress.submit();
  expect(progress.state.record.pending).toBeNull();
  progress.edit({ [field.id]: { state: 'value', value: 'Corrected' } });
  expect(progress.state.status).toBe('waiting');
  await progress.flush();
  expect(progress.state.status).toBe('saved');
  expect(send.mock.calls[1][0].operationId).not.toBe(
    send.mock.calls[0][0].operationId,
  );
  await progress.close();
});

it('preserves the local buffer when a retry receipt reports a newer server revision', async () => {
  const entry = record();
  if (!entry.session) throw new Error('Missing session');
  const field = entry.session.definition.pages[0].blocks.find(
    (block) => block.type === 'long-text',
  );
  if (!field) throw new Error('Missing field');
  const progress = new IntakeProgress(
    entry,
    {},
    {
      persist: async () => {},
      send: async (input) => ({
        operationId: input.operationId,
        revision: 2,
        currentRevision: 4,
        status: 'collecting',
      }),
      changed: () => {},
    },
  );
  progress.edit({ [field.id]: { state: 'value', value: 'Keep local' } });
  await progress.flush();
  expect(progress.state.status).toBe('conflict');
  expect(progress.state.record.pending).not.toBeNull();
  expect(progress.state.record.session?.answers[field.id]).toEqual({
    state: 'value',
    value: 'Keep local',
  });
  await progress.close();
});
