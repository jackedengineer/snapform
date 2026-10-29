import { expect, it, vi } from 'vitest';
import { verifyIntakeChallenge } from '../src/intake-challenge.ts';
const production = {
  secret: 'synthetic-secret',
  origin: 'https://snapform.test',
  mode: 'production',
  token: 'synthetic-challenge',
};
it('verifies hostname/action using the backend-only fixed provider endpoint', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      success: true,
      hostname: 'snapform.test',
      action: 'intake_start',
    }),
  );
  expect(await verifyIntakeChallenge(production, transport)).toBe('verified');
  expect(transport.mock.calls[0][0]).toBe(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  );
  expect(transport.mock.calls[0][1]).toMatchObject({
    method: 'POST',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({
    secret: production.secret,
    response: production.token,
  });
});
it('rejects failed, replayed, wrong-host and wrong-action validations', async () => {
  for (const result of [
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    { success: true, hostname: 'evil.test', action: 'intake_start' },
    { success: true, hostname: 'snapform.test', action: 'other' },
  ]) {
    expect(
      await verifyIntakeChallenge(
        production,
        vi.fn<typeof fetch>().mockResolvedValue(Response.json(result)),
      ),
    ).toBe('rejected');
  }
});
it('keeps official test credentials local and treats provider outages separately', async () => {
  const local = {
    ...production,
    secret: '1x0000000000000000000000000000000AA',
    mode: 'local',
    origin: 'http://127.0.0.1:5173',
    token: 'XXXX.DUMMY.TOKEN.XXXX',
  };
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ success: true, hostname: 'localhost', action: 'test' }),
    );
  expect(
    await verifyIntakeChallenge({ ...local, mode: 'production' }, transport),
  ).toBe('unavailable');
  expect(
    await verifyIntakeChallenge(
      { ...local, origin: 'https://snapform.test' },
      transport,
    ),
  ).toBe('unavailable');
  expect(transport).not.toHaveBeenCalled();
  expect(await verifyIntakeChallenge(local, transport)).toBe('verified');
  expect(
    await verifyIntakeChallenge(
      production,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 503 })),
    ),
  ).toBe('unavailable');
  expect(
    await verifyIntakeChallenge(
      production,
      vi.fn<typeof fetch>().mockRejectedValue(new Error('Provider down')),
    ),
  ).toBe('unavailable');
});

it('uses a request mode supported by the real Worker and refuses provider redirects', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url, init) => {
      new Request(url, init);
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://other.test' },
      });
    });
  expect(await verifyIntakeChallenge(production, transport)).toBe(
    'unavailable',
  );
  expect(transport).toHaveBeenCalledOnce();
  expect(transport.mock.calls[0][1]?.redirect).toBe('manual');
});
