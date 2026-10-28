import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const post = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  SELF.fetch(`http://127.0.0.1:5173/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://127.0.0.1:5173',
      ...headers,
    },
    body: JSON.stringify(body),
  });
describe('public auth boundary', () => {
  it('requires a session and never returns a session token from profile', async () => {
    const response = await SELF.fetch('http://127.0.0.1:5173/api/v1/me');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('keeps unused SDK endpoints closed', async () => {
    expect(
      (await SELF.fetch('http://127.0.0.1:5173/api/auth/get-session')).status,
    ).toBe(404);
    expect((await post('delete-user', {})).status).toBe(404);
  });
  it('rejects oversized auth bodies before the SDK or database', async () => {
    expect(
      (await post('sign-up/email', { email: 'a'.repeat(20000) })).status,
    ).toBe(413);
  });
  it('rejects malformed JSON and forged fields', async () => {
    const broken = await SELF.fetch(
      'http://127.0.0.1:5173/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"password":"private-fixture",',
      },
    );
    expect(broken.status).toBe(400);
    expect(await broken.text()).not.toContain('private-fixture');
    expect(
      (
        await post('sign-up/email', {
          name: 'Synthetic',
          email: 'qa@example.invalid',
          password: 'Synthetic-QA-passphrase',
          emailVerified: true,
        })
      ).status,
    ).toBe(422);
  });
  it('rejects arbitrary redirects and cross-site mutations', async () => {
    expect(
      (
        await post('request-password-reset', {
          email: 'qa@example.invalid',
          redirectTo: 'https://evil.test',
        })
      ).status,
    ).toBe(422);
    expect(
      (await post('sign-out', {}, { Origin: 'https://evil.test' })).status,
    ).toBe(403);
  });
  it('enforces the approved development recipient without sending mail', async () => {
    const response = await post('send-verification-email', {
      email: 'not-approved@example.invalid',
      callbackURL: '/login',
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('not-approved');
  });
  it('passes a real sign-in through the Express bridge without leaking credentials', async () => {
    const response = await post('sign-in/email', {
      email: 'approved@example.invalid',
      password: 'Synthetic-unregistered-password',
    });
    expect({
      status: response.status,
      body: await response.json(),
    }).toMatchObject({
      status: 401,
      body: { code: 'INVALID_EMAIL_OR_PASSWORD' },
    });
  }, 20000);
  it('limits repeated auth mutations with a native binding', async () => {
    const headers = { 'CF-Connecting-IP': `qa-${crypto.randomUUID()}` };
    for (let attempt = 0; attempt < 20; attempt++)
      expect((await post('sign-out', {}, headers)).status).toBe(200);
    const limited = await post('sign-out', {}, headers);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
  }, 20000);
});
