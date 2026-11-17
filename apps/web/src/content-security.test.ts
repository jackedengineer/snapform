import { expect, it } from 'vitest';
import { contentSecurityPolicy } from './content-security';

const nonce = '0f6c1f84-6ad9-4c34-9a4c-4b7a2a7e1d55';
const page = (frameAncestors: string, challenge = '') =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}'${challenge}; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'${challenge}; frame-src 'self'${challenge}; object-src 'none'; base-uri 'none'; frame-ancestors ${frameAncestors}; form-action 'self'`;
const challenge = ' https://challenges.cloudflare.com';

it('refuses framing for every page except a public form', () => {
  for (const path of [
    '/',
    '/app',
    '/login',
    '/privacy',
    '/workspaces/11111111-1111-4111-8111-111111111111/forms/22222222-2222-4222-8222-222222222222',
  ])
    expect(contentSecurityPolicy(path, nonce)).toBe(page("'none'"));
});

it('lets any site embed a public form and changes nothing else', () => {
  expect(
    contentSecurityPolicy('/f/11111111-1111-4111-8111-111111111111', nonce),
  ).toBe(page('*', challenge));
  expect(contentSecurityPolicy('/f/not-a-form', nonce)).toBe(
    page('*', challenge),
  );
});

it('keeps deeper or look-alike form paths unframeable', () => {
  expect(
    contentSecurityPolicy('/f/11111111-1111-4111-8111-111111111111/x', nonce),
  ).toBe(page("'none'", challenge));
  expect(contentSecurityPolicy('/f/', nonce)).toBe(page("'none'", challenge));
  expect(contentSecurityPolicy('/form/abc', nonce)).toBe(page("'none'"));
  expect(contentSecurityPolicy('/fx/abc', nonce)).toBe(page("'none'"));
});
