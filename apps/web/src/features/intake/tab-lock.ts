export type TabAccess = 'held' | 'busy' | 'denied';
type Locks = {
  request(
    name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => Promise<void>,
  ): Promise<void>;
};
// One tab at a time owns a form's browser recovery. A browser can deny locks
// to a third-party frame together with its storage; that frame has no shared
// recovery to protect, so it continues without it.
export async function withTabLock(
  locks: Locks,
  name: string,
  run: (access: TabAccess) => Promise<void>,
) {
  let entered = false;
  try {
    await locks.request(name, { ifAvailable: true }, (lock) => {
      entered = true;
      return run(lock ? 'held' : 'busy');
    });
  } catch (error) {
    if (entered) throw error;
    await run('denied');
  }
}
