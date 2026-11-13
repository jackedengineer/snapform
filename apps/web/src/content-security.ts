const challenge = ' https://challenges.cloudflare.com';
// Public forms are made to be embedded on customers' sites. Every other page,
// including the editor and account screens, refuses framing.
const embeddable = /^\/f\/[^/]+$/;
export function contentSecurityPolicy(pathname: string, nonce: string) {
  const form = pathname.startsWith('/f/') ? challenge : '';
  const ancestors = embeddable.test(pathname) ? '*' : "'none'";
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}'${form}; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'${form}; frame-src 'self'${form}; object-src 'none'; base-uri 'none'; frame-ancestors ${ancestors}; form-action 'self'`;
}
