import { afterEach, expect, it, vi } from 'vitest';
import { DraftAutosave } from './autosave';
import { newBlankDefinition } from './new-form';
import { FormRequestError } from './api';
import type { LocalDraft, SaveDraft } from '@snapform/contracts/draft';
function record(): LocalDraft {
  return {
    version: 1,
    userId: 'qa',
    workspaceId: crypto.randomUUID(),
    formId: crypto.randomUUID(),
    editorId: crypto.randomUUID(),
    updatedAt: Date.now(),
    revision: 12,
    definition: newBlankDefinition(),
    pending: null,
    backup: null,
  };
}
function receipt(input: SaveDraft) {
  return {
    id: crypto.randomUUID(),
    operationId: input.operationId,
    revision: input.expectedRevision + 1,
    currentRevision: input.expectedRevision + 1,
  };
}
afterEach(() => vi.useRealTimers());
it('coalesces typing and persists an immutable operation before sending it', async () => {
  vi.useFakeTimers();
  const initial = record();
  const writes: LocalDraft[] = [];
  const send = vi.fn(async (input: SaveDraft) => {
    expect(writes.at(-1)?.pending).toEqual(input);
    return receipt(input);
  });
  const queue = new DraftAutosave(initial, {
    persist: async (value) => {
      writes.push(structuredClone(value));
    },
    send,
    changed: vi.fn(),
  });
  queue.edit({ ...initial.definition, title: 'First' });
  queue.edit({ ...initial.definition, title: 'Final' });
  await vi.advanceTimersByTimeAsync(750);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].definition.title).toBe('Final');
  expect(queue.state.status).toBe('saved');
  expect(queue.state.record.revision).toBe(13);
  queue.close();
});
it('retains edits made while a save is in flight and advances their revision', async () => {
  const initial = record();
  let resolve!: (value: ReturnType<typeof receipt>) => void;
  const send = vi
    .fn<(input: SaveDraft) => Promise<ReturnType<typeof receipt>>>()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockImplementation(async (input) => receipt(input));
  const queue = new DraftAutosave(initial, {
    persist: async () => {},
    send,
    changed: vi.fn(),
  });
  queue.edit({ ...initial.definition, title: 'First' });
  const pending = queue.flush();
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  queue.edit({ ...initial.definition, title: 'Later' });
  resolve(receipt(send.mock.calls[0][0]));
  await pending;
  expect(queue.state.status).toBe('waiting');
  expect(queue.state.record.definition.title).toBe('Later');
  await queue.flush();
  expect(send.mock.calls[1][0].expectedRevision).toBe(13);
  expect(send.mock.calls[1][0].definition.title).toBe('Later');
  queue.close();
});
it('retries uncertain writes unchanged, stops stale receipts, and preserves local alternatives', async () => {
  const initial = record();
  const send = vi
    .fn<(input: SaveDraft) => Promise<ReturnType<typeof receipt>>>()
    .mockRejectedValueOnce(new FormRequestError('unavailable', 'Offline'))
    .mockImplementation(async (input) => ({
      ...receipt(input),
      currentRevision: 15,
    }));
  const queue = new DraftAutosave(initial, {
    persist: async () => {},
    send,
    changed: vi.fn(),
  });
  queue.edit({ ...initial.definition, title: 'Unconfirmed' });
  await queue.flush();
  expect(queue.state.status).toBe('offline');
  queue.edit({ ...initial.definition, title: 'Keep this too' });
  await queue.flush();
  expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
  expect(queue.state.status).toBe('conflict');
  expect(queue.state.record.definition.title).toBe('Keep this too');
  await queue.flush();
  expect(send).toHaveBeenCalledTimes(2);
  queue.close();
});
it('respects rate-limit backoff and closes without publishing late acknowledgements', async () => {
  vi.useFakeTimers();
  const initial = record();
  const send = vi.fn(async () => {
    throw new FormRequestError('rate-limited', 'Wait');
  });
  const changed = vi.fn();
  const queue = new DraftAutosave(initial, {
    persist: async () => {},
    send,
    changed,
  });
  queue.edit({ ...initial.definition, title: 'Changed' });
  await queue.flush();
  await queue.flush();
  expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  await queue.flush();
  expect(send).toHaveBeenCalledTimes(2);
  queue.close();
  const count = changed.mock.calls.length;
  queue.edit(initial.definition);
  await queue.flush();
  expect(changed.mock.calls.length).toBe(count);
});
it('reports storage failure honestly while allowing a confirmed online save', async () => {
  const initial = record();
  const queue = new DraftAutosave(initial, {
    persist: async () => {
      throw new Error('Quota');
    },
    send: async (input) => receipt(input),
    changed: vi.fn(),
  });
  queue.edit({ ...initial.definition, title: 'Online' });
  await queue.flush();
  expect(queue.state.storageError).toBe(true);
  expect(queue.state.status).toBe('saved');
  queue.close();
});
it('recovers pending operations against receipts and requires review of an older unconfirmed alternative', async () => {
  const initial = record();
  const send = vi.fn(async (input: SaveDraft) => receipt(input));
  const queue = new DraftAutosave(initial, {
    persist: async () => {},
    send,
    changed: vi.fn(),
  });
  const older = {
    ...initial,
    definition: { ...initial.definition, title: 'Older local copy' },
    revision: 10,
  };
  queue.recover(older, 12);
  expect(queue.state.status).toBe('conflict');
  await queue.flush();
  expect(send).not.toHaveBeenCalled();
  queue.accept(12, initial.definition);
  expect(queue.state.record.backup?.title).toBe('Older local copy');
  queue.recover(
    {
      ...older,
      pending: {
        operationId: crypto.randomUUID(),
        expectedRevision: 10,
        definition: older.definition,
      },
    },
    12,
  );
  await queue.flush();
  expect(send.mock.calls[0][0].expectedRevision).toBe(10);
  queue.close();
});
it('aborts on close and never persists a late HTTP result', async () => {
  const initial = record();
  let resolve!: (value: ReturnType<typeof receipt>) => void;
  const send = vi.fn<
    (
      input: SaveDraft,
      signal: AbortSignal,
    ) => Promise<ReturnType<typeof receipt>>
  >(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const persist = vi.fn(async () => {});
  const changed = vi.fn();
  const queue = new DraftAutosave(initial, { persist, send, changed });
  queue.edit({ ...initial.definition, title: 'Pending' });
  const saving = queue.flush();
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  queue.close();
  const count = persist.mock.calls.length;
  const updates = changed.mock.calls.length;
  expect(send.mock.calls[0][1].aborted).toBe(true);
  resolve(receipt(send.mock.calls[0][0]));
  await saving;
  expect(persist.mock.calls.length).toBe(count);
  expect(changed.mock.calls.length).toBe(updates);
});
it('waits for local durability before allowing internal navigation and refuses unsafe loss', async () => {
  const initial = record();
  const persist = vi.fn<() => Promise<void>>(async () => {
    throw new Error('Quota');
  });
  const queue = new DraftAutosave(initial, {
    persist,
    send: async () => {
      throw new FormRequestError('unavailable', 'Offline');
    },
    changed: vi.fn(),
  });
  queue.edit({ ...initial.definition, title: 'Not durable' });
  expect(await queue.canLeave()).toBe(false);
  persist.mockImplementation(async () => {});
  expect(await queue.canLeave()).toBe(true);
  expect(queue.state.storageError).toBe(false);
  queue.close();
});
it('captures the final keystroke when navigation happens before the React edit effect', async () => {
  const initial = record();
  const send = vi.fn(async (input: SaveDraft) => receipt(input));
  const queue = new DraftAutosave(initial, {
    persist: async () => {},
    send,
    changed: vi.fn(),
  });
  expect(
    await queue.canLeave({
      ...initial.definition,
      title: 'Last keystroke before leaving',
    }),
  ).toBe(true);
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0][0].definition.title).toBe(
    'Last keystroke before leaving',
  );
  queue.close();
});
it('captures the latest form values for an explicit save before React effects run', async () => {
  const initial = record();
  const send = vi.fn(async (input: SaveDraft) => receipt(input));
  const queue = new DraftAutosave(initial, {
    persist: async () => {},
    send,
    changed: vi.fn(),
  });
  await queue.flush({
    ...initial.definition,
    description: 'The final explicit-save edit',
  });
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0][0].definition.description).toBe(
    'The final explicit-save edit',
  );
  queue.close();
});
it('allows a corrected local validation failure to use a fresh operation', async () => {
  const initial = record();
  const send = vi
    .fn<(input: SaveDraft) => Promise<ReturnType<typeof receipt>>>()
    .mockRejectedValueOnce(new FormRequestError('invalid', 'Unsupported draft'))
    .mockImplementation(async (input) => receipt(input));
  const queue = new DraftAutosave(initial, {
    persist: async () => {},
    send,
    changed: vi.fn(),
  });
  queue.edit({ ...initial.definition, title: 'Invalid candidate' });
  await queue.flush();
  expect(queue.state.status).toBe('blocked');
  queue.edit({ ...initial.definition, title: 'Corrected candidate' });
  await queue.flush();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0].operationId).not.toBe(
    send.mock.calls[0][0].operationId,
  );
  expect(send.mock.calls[1][0].definition.title).toBe('Corrected candidate');
  expect(queue.state.status).toBe('saved');
  queue.close();
});
it('does not resume automatic writes after an authentication or permission failure', async () => {
  for (const code of ['unauthenticated', 'forbidden', 'not-found'] as const) {
    const initial = record();
    const send = vi.fn(async () => {
      throw new FormRequestError(code, 'Access unavailable');
    });
    const queue = new DraftAutosave(initial, {
      persist: async () => {},
      send,
      changed: vi.fn(),
    });
    queue.edit({ ...initial.definition, title: 'First edit' });
    await queue.flush();
    queue.edit({ ...initial.definition, title: 'Later edit' });
    await queue.flush();
    expect(queue.state.status).toBe('blocked');
    expect(send).toHaveBeenCalledOnce();
    queue.close();
  }
});
it('keeps a newer correction saveable when an older candidate fails local validation', async () => {
  const initial = record();
  const send = vi
    .fn<(input: SaveDraft) => Promise<ReturnType<typeof receipt>>>()
    .mockRejectedValueOnce(new FormRequestError('invalid', 'Unsupported draft'))
    .mockImplementation(async (input) => receipt(input));
  const queue = new DraftAutosave(initial, {
    persist: async () => {},
    send,
    changed: vi.fn(),
  });
  queue.edit({ ...initial.definition, title: 'Invalid earlier candidate' });
  const first = queue.flush();
  queue.edit({ ...initial.definition, title: 'Newer corrected candidate' });
  await first;
  await queue.flush();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0].definition.title).toBe(
    'Newer corrected candidate',
  );
  expect(queue.state.status).toBe('saved');
  queue.close();
});
