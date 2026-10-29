export function withTransportSecurity(response: Response, url: string) {
  if (new URL(url).protocol !== 'https:') return response;
  const secured = new Response(response.body, response);
  secured.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return secured;
}
