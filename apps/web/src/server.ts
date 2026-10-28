import { env } from 'cloudflare:workers';
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

export default createServerEntry({
  async fetch(request, options) {
    if (new URL(request.url).pathname.startsWith('/api/'))
      return env.API.fetch(request);
    const nonce = crypto.randomUUID();
    const response = await handler.fetch(request, {
      ...options,
      context: { nonce },
    });
    const secured = new Response(response.body, response);
    secured.headers.set('Cache-Control', 'no-store');
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    secured.headers.set('Referrer-Policy', 'no-referrer');
    secured.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    if (import.meta.env.PROD) {
      secured.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
      );
    }
    return secured;
  },
});
