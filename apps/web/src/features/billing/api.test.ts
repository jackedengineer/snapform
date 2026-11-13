import { afterEach, expect, it, vi } from 'vitest';
import { cancelPlan, startCheckout } from './api';

afterEach(() => vi.unstubAllGlobals());
const workspaceId = '28765529-6337-4512-b148-f735ad07d28b';

it('starts test-mode checkout with only the chosen interval and currency', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      checkout: {
        key: 'rzp_test_SyntheticKey01',
        subscriptionId: 'sub_Synthetic000001',
      },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(
    await startCheckout(workspaceId, { interval: 'annual', currency: 'USD' }),
  ).toEqual({
    key: 'rzp_test_SyntheticKey01',
    subscriptionId: 'sub_Synthetic000001',
  });
  const [path, init] = fetcher.mock.calls[0];
  expect(path).toBe(`/api/v1/workspaces/${workspaceId}/billing/checkout`);
  expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
  expect(JSON.parse(init.body)).toEqual({
    interval: 'annual',
    currency: 'USD',
  });
});

it('refuses a live key or malformed checkout from the server', async () => {
  for (const checkout of [
    { key: 'rzp_live_SyntheticKey01', subscriptionId: 'sub_Synthetic000001' },
    { key: 'rzp_test_SyntheticKey01', subscriptionId: 'pay_Synthetic000001' },
  ]) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ checkout })),
    );
    await expect(
      startCheckout(workspaceId, { interval: 'monthly', currency: 'INR' }),
    ).rejects.toThrow('We couldn’t confirm that billing change.');
  }
});

it('turns billing failures into plain explanations', async () => {
  for (const [code, status, message] of [
    ['BILLING_NOT_CONFIGURED', 503, 'Billing isn’t configured yet.'],
    ['BILLING_ALREADY_ACTIVE', 409, 'This workspace already has Pro.'],
    ['FORBIDDEN', 403, 'Only the workspace owner can change the plan.'],
    [
      'BILLING_PROVIDER_UNAVAILABLE',
      502,
      'Razorpay didn’t respond, so nothing changed. Try again.',
    ],
    ['SOMETHING_ELSE', 500, 'We couldn’t confirm that billing change.'],
  ] as const) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: { code } }, { status })),
    );
    await expect(cancelPlan(workspaceId)).rejects.toThrow(message);
  }
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  await expect(cancelPlan(workspaceId)).rejects.toThrow(
    'We couldn’t confirm that billing change.',
  );
});
