import { expect, it, vi } from 'vitest';
import { withTabLock } from './tab-lock';
import type { TabAccess } from './tab-lock';

const granted = (lock: Lock | null) => ({
  request: (
    _name: string,
    _options: LockOptions,
    callback: (lock: Lock | null) => Promise<void>,
  ) => callback(lock),
});

it('runs with the lock, or reports another tab holding it', async () => {
  const run = vi.fn<(access: TabAccess) => Promise<void>>(async () => {});
  await withTabLock(
    granted({ name: 'snapform-intake:x', mode: 'exclusive' }),
    'snapform-intake:x',
    run,
  );
  await withTabLock(granted(null), 'snapform-intake:x', run);
  expect(run.mock.calls).toEqual([['held'], ['busy']]);
});

it('still opens the form when a third-party frame is denied locks', async () => {
  const run = vi.fn<(access: TabAccess) => Promise<void>>(async () => {});
  const denied = {
    request: () =>
      Promise.reject(
        new DOMException('Access to the Locks API is denied.', 'SecurityError'),
      ),
  };
  await withTabLock(denied, 'snapform-intake:x', run);
  expect(run.mock.calls).toEqual([['denied']]);
});

it('never reruns the form after a failure while holding the lock', async () => {
  const failure = new Error('Failed while holding the lock');
  const run = vi.fn(async () => {
    throw failure;
  });
  await expect(
    withTabLock(
      granted({ name: 'snapform-intake:x', mode: 'exclusive' }),
      'snapform-intake:x',
      run,
    ),
  ).rejects.toBe(failure);
  expect(run).toHaveBeenCalledTimes(1);
});
