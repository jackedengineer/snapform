import { env } from 'cloudflare:workers';
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { withTransportSecurity } from './transport';
import { formatExportDownload } from './export-download';
import { contentSecurityPolicy } from './content-security';
import styles from './styles.css?url';

export default createServerEntry({
  async fetch(request, options) {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      const response = await formatExportDownload(
        request,
        await env.API.fetch(request),
        styles,
      );
      return withTransportSecurity(response, request.url);
    }
    const nonce = crypto.randomUUID();
    const response = await handler.fetch(request, {
      ...options,
      context: { nonce },
    });
    const secured = new Response(response.body, response);
    secured.headers.set('Cache-Control', 'no-store, no-transform');
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    secured.headers.set('Referrer-Policy', 'no-referrer');
    secured.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    if (import.meta.env.PROD)
      secured.headers.set(
        'Content-Security-Policy',
        contentSecurityPolicy(new URL(request.url).pathname, nonce),
      );
    return withTransportSecurity(secured, request.url);
  },
});
