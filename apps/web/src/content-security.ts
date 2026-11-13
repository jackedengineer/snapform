const challenge = ' https://challenges.cloudflare.com';
// Public forms are made to be embedded on customers' sites. Every other page,
// including the editor and account screens, refuses framing.
const embeddable = /^\/f\/[^/]+$/;
// Third-party hosts are allowed only on the page that needs them: Turnstile on
// public forms, Razorpay Checkout (script plus its payment frame) on billing.
const billingPage = /^\/workspaces\/[^/]+\/billing\/?$/;
export function contentSecurityPolicy(pathname: string, nonce: string) {
  const turnstile = pathname.startsWith('/f/') ? challenge : '';
  const checkout = billingPage.test(pathname);
  const script = turnstile + (checkout ? ' https://checkout.razorpay.com' : '');
  const frame =
    turnstile +
    (checkout ? ' https://api.razorpay.com https://checkout.razorpay.com' : '');
  const ancestors = embeddable.test(pathname) ? '*' : "'none'";
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}'${script}; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'${turnstile}; frame-src 'self'${frame}; object-src 'none'; base-uri 'none'; frame-ancestors ${ancestors}; form-action 'self'`;
}
