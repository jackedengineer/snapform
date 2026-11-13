import { describe, expect, it } from 'vitest';
import { accountRedirect, signInSearch } from './redirect';

describe('sign-in link for a signed-out account page', () => {
  it('remembers a deep account page so sign-in can return to it', () => {
    expect(signInSearch('/workspaces/ws_1', '?response=abc')).toEqual({
      redirect: '/workspaces/ws_1?response=abc',
    });
  });

  it('never nests sign-in pages or keeps the default destination', () => {
    expect(signInSearch('/login', '?redirect=%2Fworkspaces%2Fws_1')).toEqual(
      {},
    );
    expect(signInSearch('/app', '')).toEqual({});
    expect(signInSearch('/signup', '')).toEqual({});
  });
});

describe('post sign-in redirect', () => {
  it('returns to the account page the person was trying to open', () => {
    expect(accountRedirect('/app')).toBe('/app');
    expect(
      accountRedirect('/workspaces/ws_1/responses/form_1?response=abc'),
    ).toBe('/workspaces/ws_1/responses/form_1?response=abc');
  });

  it('falls back to the workspace list for anything that is not an account path', () => {
    for (const value of [
      undefined,
      null,
      42,
      '',
      'https://evil.example/app',
      '//evil.example/app',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      '/login',
      '/signup?redirect=/app',
      '/f/public-form',
      '/appendix',
      '/workspaces',
      '/app/../login',
      '/workspaces/%2e%2e/login',
      '/app#fragment',
      '/app\nSet-Cookie: x=y',
      `/app?${'a'.repeat(600)}`,
    ])
      expect(accountRedirect(value)).toBe('/app');
  });
});
