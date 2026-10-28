import { afterEach, expect, it, vi } from 'vitest';
import { hasDraftStorage } from './draft-storage';
import { prepareDraftSignOut } from './draft-session';
vi.mock('./draft-storage', () => ({
  hasDraftStorage: vi.fn(),
  clearDraftStorage: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it('finishes the active save before checking copies and respects cancellation', async () => {
  const prepared = vi.fn(async () => {});
  vi.mocked(hasDraftStorage).mockImplementation(async () => {
    expect(prepared).toHaveBeenCalledOnce();
    return true;
  });
  const confirm = vi.fn(() => false);
  vi.stubGlobal('window', { confirm });
  expect(await prepareDraftSignOut(prepared)).toBe(false);
  expect(confirm).toHaveBeenCalledOnce();
});
it('does not require a discard confirmation when no local copies remain', async () => {
  vi.mocked(hasDraftStorage).mockResolvedValue(false);
  const confirm = vi.fn();
  vi.stubGlobal('window', { confirm });
  expect(await prepareDraftSignOut()).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
});
it('lets a user sign out when browser storage fails, with an explicit warning', async () => {
  vi.mocked(hasDraftStorage).mockRejectedValue(new Error('Storage blocked'));
  const confirm = vi.fn<(message: string) => boolean>(() => true);
  vi.stubGlobal('window', { confirm });
  expect(await prepareDraftSignOut()).toBe(true);
  expect(confirm.mock.calls[0][0]).toContain('couldn’t check');
});
