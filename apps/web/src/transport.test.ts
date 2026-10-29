import { expect, it } from 'vitest';
import { withTransportSecurity } from './transport';

it('adds host-only HSTS to HTTPS while preserving API headers, body and cookies', async () => {
  const headers = new Headers({
    'Content-Security-Policy': "default-src 'none'",
  });
  headers.append('Set-Cookie', 'first=one; Secure; HttpOnly');
  headers.append('Set-Cookie', 'second=two; Secure; HttpOnly');
  const original = new Response('ok', { headers });
  const secured = withTransportSecurity(
    original,
    'https://snapform.jacked.dev/api/v1/health',
  );
  expect(secured.headers.get('Strict-Transport-Security')).toBe(
    'max-age=31536000',
  );
  expect(original.headers.has('Strict-Transport-Security')).toBe(false);
  expect(secured.headers.getSetCookie()).toHaveLength(2);
  expect(secured.headers.get('Content-Security-Policy')).toBe(
    "default-src 'none'",
  );
  expect(await secured.text()).toBe('ok');
});
it('does not pin local HTTP development to HTTPS', () => {
  const response = new Response('local');
  expect(withTransportSecurity(response, 'http://127.0.0.1:5173/')).toBe(
    response,
  );
  expect(response.headers.has('Strict-Transport-Security')).toBe(false);
});
