import { afterEach, expect, it, vi } from 'vitest';
import { fetchWorkspaces, createWorkspaceRequest } from './api';
const workspace = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Studio QA',
  segment: 'agency',
  role: 'owner',
};
afterEach(() => vi.unstubAllGlobals());
it('checks workspace data before returning it to the UI', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ workspaces: [workspace] })),
  );
  expect(await fetchWorkspaces()).toEqual([workspace]);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ workspaces: [{ ...workspace, role: 'admin' }] }),
      ),
  );
  await expect(fetchWorkspaces()).rejects.toThrow(
    'We couldn’t load your workspaces.',
  );
});
it('keeps the operation UUID stable and uses server-confirmed workspace data', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ workspace }, { status: 201 }));
  vi.stubGlobal('fetch', transport);
  const { id, name, segment } = workspace;
  expect(await createWorkspaceRequest({ id, name, segment: 'agency' })).toEqual(
    workspace,
  );
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({
    id,
    name,
    segment,
  });
});
it('does not expose server diagnostics or turn an unexpected success into a workspace', async () => {
  const input = {
    id: workspace.id,
    name: workspace.name,
    segment: 'agency' as const,
  };
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: 'private-detail' }, { status: 500 }),
      ),
  );
  await expect(createWorkspaceRequest(input)).rejects.toThrow(
    'We couldn’t confirm your workspace. Your details are still here.',
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ unexpected: true })),
  );
  await expect(createWorkspaceRequest(input)).rejects.toThrow(
    'We couldn’t confirm your workspace. Your details are still here.',
  );
});
