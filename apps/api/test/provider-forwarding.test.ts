import { SELF, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { sendWhileFull } from './rate-limit.ts';
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
it('forwards status reads to Jobs and limits them per client address', async () => {
  const url = 'https://snapform.jacked.dev/api/v1/status';
  expect((await SELF.fetch(url)).status).toBe(200);
  const address = `qa-status-${crypto.randomUUID()}`;
  const limited = await sendWhileFull(
    env.PUBLIC_READ_RATE_LIMIT,
    'status:' + address,
    () => SELF.fetch(url, { headers: { 'CF-Connecting-IP': address } }),
  );
  expect(limited.status).toBe(429);
  expect(limited.headers.get('Retry-After')).toBe('60');
  // A cross-site write never reaches Jobs.
  const forged = await SELF.fetch(url, {
    method: 'POST',
    headers: { Origin: 'https://evil.test' },
  });
  expect(forged.status).toBe(403);
});
