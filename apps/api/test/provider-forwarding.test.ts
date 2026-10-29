import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
it('forwards the exact provider body and signature to the private receipt boundary', async () => {
  const body = '{"synthetic":true}\n';
  const r = await SELF.fetch(
    'https://snapform.jacked.dev/api/v1/hooks/resend',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-signature': 'synthetic-signature',
      },
      body,
    },
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ body, signature: 'synthetic-signature' });
});
