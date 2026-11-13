import { describe, expect, it } from 'vitest';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  hashInvitationToken,
  invitationTokenFromFragment,
  invitationTokenSchema,
  memberIdSchema,
  newInvitationToken,
  removalDecision,
  roleChangeDecision,
  teamSchema,
} from './team.ts';

describe('invitation input', () => {
  it('normalizes the address and accepts only editor or viewer invites', () => {
    expect(
      createInvitationSchema.parse({
        email: '  Casey.Q@Example.COM ',
        role: 'viewer',
      }),
    ).toEqual({ email: 'casey.q@example.com', role: 'viewer' });
    expect(
      createInvitationSchema.parse({ email: 'a@example.com', role: 'editor' })
        .role,
    ).toBe('editor');
  });

  it('rejects owner invites, malformed addresses and unknown keys', () => {
    for (const input of [
      { email: 'a@example.com', role: 'owner' },
      { email: 'a@example.com', role: 'admin' },
      { email: 'not-an-email', role: 'viewer' },
      { email: `${'a'.repeat(250)}@example.com`, role: 'viewer' },
      { email: 'a@example.com\r\nBcc: b@example.com', role: 'viewer' },
      { email: 'a@example.com', role: 'viewer', workspaceId: 'x' },
      { email: 'a@example.com' },
      null,
      'a@example.com',
    ])
      expect(createInvitationSchema.safeParse(input).success).toBe(false);
  });
});

describe('invitation token', () => {
  it('mints 32 random bytes as a canonical 43 character token', () => {
    const tokens = new Set(Array.from({ length: 64 }, newInvitationToken));
    expect(tokens.size).toBe(64);
    for (const token of tokens)
      expect(invitationTokenSchema.safeParse(token).success).toBe(true);
  });

  it('rejects tokens that are not exactly 32 bytes of base64url', () => {
    const valid = newInvitationToken();
    for (const token of [
      '',
      valid.slice(0, 42),
      valid + 'A',
      valid.slice(0, 42) + 'B',
      valid.slice(0, 42) + '=',
      valid.slice(0, 41) + '+A',
      valid.slice(0, 41) + '/A',
      ' '.repeat(43),
    ])
      expect(invitationTokenSchema.safeParse(token).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: valid }).success).toBe(
      true,
    );
    expect(
      acceptInvitationSchema.safeParse({ token: valid, email: 'a@b.co' })
        .success,
    ).toBe(false);
  });

  it('stores only a SHA-256 hex digest of the token', async () => {
    const token = 'A'.repeat(43);
    const hash = await hashInvitationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(token),
          ),
        ),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join(''),
    );
    expect(hash).not.toContain(token);
    expect(await hashInvitationToken(newInvitationToken())).not.toBe(hash);
  });

  it('reads a token only from an exact link fragment', () => {
    const token = newInvitationToken();
    expect(invitationTokenFromFragment(`#token=${token}`)).toBe(token);
    for (const fragment of [
      '',
      '#',
      `token=${token}`,
      `#token=${token}&next=/app`,
      `#token=${token.slice(1)}`,
      `#other=${token}`,
      `#token=${encodeURIComponent('<script>')}`,
    ])
      expect(invitationTokenFromFragment(fragment)).toBeNull();
  });
});

describe('member role rules', () => {
  it('lets only owners change roles', () => {
    expect(roleChangeDecision('owner', 'viewer', 'editor', 1)).toBe('allowed');
    expect(roleChangeDecision('owner', 'editor', 'owner', 1)).toBe('allowed');
    for (const actor of ['editor', 'viewer'] as const)
      expect(roleChangeDecision(actor, 'viewer', 'editor', 1)).toBe(
        'FORBIDDEN',
      );
  });

  it('never leaves a workspace without an owner', () => {
    expect(roleChangeDecision('owner', 'owner', 'editor', 1)).toBe(
      'LAST_OWNER',
    );
    expect(roleChangeDecision('owner', 'owner', 'viewer', 0)).toBe(
      'LAST_OWNER',
    );
    expect(roleChangeDecision('owner', 'owner', 'editor', 2)).toBe('allowed');
    expect(roleChangeDecision('owner', 'owner', 'owner', 1)).toBe('allowed');
    expect(removalDecision('owner', 'owner', 1)).toBe('LAST_OWNER');
    expect(removalDecision('owner', 'owner', 2)).toBe('allowed');
    expect(removalDecision('owner', 'viewer', 1)).toBe('allowed');
  });

  it('keeps editors and viewers from removing anyone', () => {
    for (const actor of ['editor', 'viewer'] as const)
      for (const target of ['owner', 'editor', 'viewer'] as const)
        expect(removalDecision(actor, target, 2)).toBe('FORBIDDEN');
  });

  it('fails closed for unknown roles', () => {
    expect(roleChangeDecision('admin', 'viewer', 'editor', 2)).toBe(
      'FORBIDDEN',
    );
    expect(roleChangeDecision('owner', 'viewer', 'admin', 2)).toBe('FORBIDDEN');
    expect(removalDecision('owner', 'admin', 2)).toBe('FORBIDDEN');
  });
});

describe('team payloads', () => {
  it('accepts opaque account identifiers and rejects path tricks', () => {
    expect(memberIdSchema.safeParse('a1B2-c3_D4').success).toBe(true);
    for (const id of ['', '../x', 'a/b', 'a b', 'x'.repeat(65), '%2e'])
      expect(memberIdSchema.safeParse(id).success).toBe(false);
  });

  it('parses a strict member list', () => {
    const member = {
      userId: 'user-1',
      name: 'Casey',
      email: 'casey@example.com',
      role: 'owner',
      joinedAt: '2026-11-01T10:00:00.000Z',
    };
    expect(teamSchema.parse({ role: 'viewer', members: [member] })).toEqual({
      role: 'viewer',
      members: [member],
    });
    expect(
      teamSchema.safeParse({
        role: 'viewer',
        members: [{ ...member, tokenHash: 'x' }],
      }).success,
    ).toBe(false);
  });
});
