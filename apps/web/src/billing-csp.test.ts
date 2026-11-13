import { expect, it } from 'vitest';
import { contentSecurityPolicy } from './content-security';

const nonce = '9f5c1c50-3c1e-4c55-8a39-4d6f0a3f2f11';
const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((part) => part.startsWith(name + ' '))
    ?.split(' ')
    .slice(1);

it('keeps every page to its own origin by default', () => {
  const policy = contentSecurityPolicy('/workspaces/abc', nonce);
  expect(directive(policy, 'script-src')).toEqual([
    "'self'",
    `'nonce-${nonce}'`,
  ]);
  expect(directive(policy, 'frame-src')).toEqual(["'self'"]);
  expect(directive(policy, 'connect-src')).toEqual(["'self'"]);
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain('razorpay');
});

it('allows Turnstile only on public forms', () => {
  const policy = contentSecurityPolicy('/f/some-form', nonce);
  for (const name of ['script-src', 'connect-src', 'frame-src'])
    expect(directive(policy, name)).toContain(
      'https://challenges.cloudflare.com',
    );
  expect(policy).not.toContain('razorpay');
});

it('allows Razorpay Checkout scripts and frames only on the billing page', () => {
  const billing = contentSecurityPolicy(
    '/workspaces/28765529-6337-4512-b148-f735ad07d28b/billing',
    nonce,
  );
  expect(directive(billing, 'script-src')).toEqual([
    "'self'",
    `'nonce-${nonce}'`,
    'https://checkout.razorpay.com',
  ]);
  expect(directive(billing, 'frame-src')).toEqual([
    "'self'",
    'https://api.razorpay.com',
    'https://checkout.razorpay.com',
  ]);
  expect(directive(billing, 'connect-src')).toEqual(["'self'"]);
  expect(billing).not.toContain('challenges.cloudflare.com');
  for (const path of [
    '/pricing',
    '/workspaces/x/billing/extra',
    '/workspaces/billing',
    '/f/workspaces/x/billing',
  ])
    expect(contentSecurityPolicy(path, nonce)).not.toContain('razorpay');
});
