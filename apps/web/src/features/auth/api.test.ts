import { afterEach, describe, expect, it, vi } from 'vitest';
import { authPost, currentUser } from './api';

afterEach(() => vi.unstubAllGlobals());
describe('browser auth HTTP client', () => {
  it('sends same-origin JSON once without retaining a returned token', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ success: true, token: 'synthetic-session' }),
      );
    vi.stubGlobal('fetch', transport);
    expect(await authPost('sign-out', {})).toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe('/api/auth/sign-out');
    expect(transport.mock.calls[0][1]).toMatchObject({
      credentials: 'same-origin',
      method: 'POST',
      redirect: 'error',
    });
  });
  it.each([
    [401, 'INVALID_EMAIL_OR_PASSWORD', 'Check your email and password.'],
    [403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in.'],
    [429, 'RATE_LIMITED', 'Too many attempts. Wait a minute and try again.'],
    [
      500,
      'private-diagnostic',
      'We couldn’t complete that request. Please try again.',
    ],
  ])(
    'maps errors without reflecting diagnostics',
    async (status, code, message) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              { code, message: 'private-diagnostic' },
              { status: Number(status) },
            ),
          ),
      );
      await expect(authPost('sign-out', {})).rejects.toThrow(String(message));
    },
  );
  it('treats an absent session as signed out and validates profile responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    expect(await currentUser()).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          user: {
            id: 'a',
            name: 'QA',
            email: 'qa@example.invalid',
            token: 'forged',
          },
        }),
      ),
    );
    expect(await currentUser()).toEqual({
      id: 'a',
      name: 'QA',
      email: 'qa@example.invalid',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ user: { name: 'incomplete' } })),
    );
    await expect(currentUser()).rejects.toThrow(
      'We couldn’t load your account.',
    );
  });
  it('sanitizes a rejected network request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private-network-diagnostic')),
    );
    await expect(authPost('sign-out', {})).rejects.toThrow(
      'We couldn’t complete that request. Please try again.',
    );
  });
  it.each([
    new Response('<html>wrong route</html>'),
    Response.json({ unexpected: true }),
  ])(
    'rejects a false success from an unexpected response',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(authPost('sign-out', {})).rejects.toThrow(
        'We couldn’t complete that request. Please try again.',
      );
    },
  );
  it.each([
    'sign-up/email',
    'sign-in/email',
    'request-password-reset',
    'reset-password',
    'send-verification-email',
  ])(
    'accepts the documented %s reply without exposing credentials',
    async (path) => {
      const reply = path.includes('/email')
        ? {
            token: 'synthetic-token',
            user: { id: 'qa', name: 'QA', email: 'qa@example.invalid' },
          }
        : { status: true };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(reply)));
      expect(await authPost(path, {})).toBeUndefined();
    },
  );
});
