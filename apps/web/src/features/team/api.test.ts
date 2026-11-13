import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptInvite,
  createInvite,
  expiryLabel,
  fetchTeam,
  memberControls,
  removeMember,
  seatNotice,
  TeamRequestError,
} from './api';

const workspace = crypto.randomUUID();
afterEach(() => vi.unstubAllGlobals());
function reply(status: number, body?: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('team requests', () => {
  it('sends a normalized invite as same-origin JSON and keeps the link', async () => {
    const inviteUrl = `https://snapform.test/invite#token=${'A'.repeat(42)}Q`;
    const fetch = reply(201, { invitation: {}, inviteUrl, emailSent: false });
    expect(await createInvite(workspace, ' New@Example.com', 'viewer')).toEqual(
      { email: 'new@example.com', url: inviteUrl, emailSent: false },
    );
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe(`/api/v1/workspaces/${workspace}/invitations`);
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'new@example.com',
      role: 'viewer',
    });
  });

  it('refuses an invalid address before any request', async () => {
    const fetch = reply(201, {});
    for (const email of ['nope', 'a@b', `${'a'.repeat(250)}@example.com`])
      await expect(
        createInvite(workspace, email, 'editor'),
      ).rejects.toMatchObject({
        code: 'INVALID_INVITATION',
      });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the server code and explains it in plain words', async () => {
    reply(409, { error: { code: 'LAST_OWNER' } });
    const error = await removeMember(workspace, 'user-1').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TeamRequestError);
    expect(error).toMatchObject({ code: 'LAST_OWNER' });
    expect(String(error)).toMatch(/someone else an owner/);
    reply(403, { error: { code: 'FORBIDDEN' } });
    await expect(fetchTeam(workspace)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Only owners can manage the team.',
    });
    reply(401, {});
    await expect(fetchTeam(workspace)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    reply(500, 'not json');
    await expect(fetchTeam(workspace)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError()),
    );
    await expect(fetchTeam(workspace)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('rejects a malformed success body', async () => {
    reply(200, { role: 'admin', members: [] });
    await expect(fetchTeam(workspace)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    reply(200, { role: 'viewer', members: 'all' });
    await expect(fetchTeam(workspace)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    reply(204);
    await expect(removeMember(workspace, 'user-1')).resolves.toEqual({});
  });

  it('posts an invite token only in the body', async () => {
    const token = 'A'.repeat(42) + 'Q';
    const fetch = reply(200, {
      workspace: { id: workspace, name: 'Studio', role: 'viewer' },
    });
    expect(await acceptInvite(token)).toBe(workspace);
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/api/v1/invitations/accept');
    expect(JSON.parse(String(init?.body))).toEqual({ token });
    reply(200, { workspace: null });
    await expect(acceptInvite(token)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('explains each acceptance refusal', () => {
    for (const [code, text] of [
      ['INVITATION_EXPIRED', /expired/],
      ['INVITATION_USED', /already been used/],
      ['INVITATION_REVOKED', /withdrawn/],
      ['INVITATION_NOT_FOUND', /isn’t valid/],
      ['INVITATION_EMAIL_MISMATCH', /different email address/],
      ['SOMETHING_ELSE', /couldn’t reach/],
    ] as const)
      expect(new TeamRequestError(code).message).toMatch(text);
  });
});

describe('team display rules', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  it('labels live and expired invites', () => {
    expect(expiryLabel('2026-11-20T10:00:00Z', now)).toBe('Expires Nov 20');
    expect(expiryLabel('2026-11-13T11:59:59Z', now)).toBe('Expired');
  });
  it('offers owners every safe change and nothing to others', () => {
    expect(memberControls('owner', { role: 'viewer' }, 1)).toEqual({
      manage: true,
      lastOwner: false,
    });
    expect(memberControls('owner', { role: 'owner' }, 1)).toEqual({
      manage: true,
      lastOwner: true,
    });
    expect(memberControls('owner', { role: 'owner' }, 2)).toEqual({
      manage: true,
      lastOwner: false,
    });
    for (const role of ['editor', 'viewer'] as const)
      expect(memberControls(role, { role: 'viewer' }, 1)).toEqual({
        manage: false,
        lastOwner: false,
      });
  });
  it('names the plan seats and offers an upgrade only on Free', () => {
    expect(seatNotice({ plan: 'free', seatLimit: 1 })).toEqual({
      text: 'Your plan includes 1 seat.',
      upgrade: true,
    });
    expect(seatNotice({ plan: 'pro', seatLimit: 3 })).toEqual({
      text: 'Your plan includes 3 seats. Revoke an invite or remove someone to free a seat.',
      upgrade: false,
    });
    // Without the plan the owner still learns why and where to look.
    expect(seatNotice(undefined)).toEqual({
      text: 'Every seat on your plan is in use.',
      upgrade: true,
    });
  });
});
