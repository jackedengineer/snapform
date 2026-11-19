import { afterEach, expect, it, vi } from 'vitest';
import {
  cancelPlan,
  fetchBillingOptions,
  startCardUpdate,
  startCheckout,
} from './api';

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

it('opens live-mode checkout with a live public key', async () => {
  const checkout = {
    key: 'rzp_live_SyntheticKey01',
    subscriptionId: 'sub_Synthetic000001',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ checkout })),
  );
  expect(
    await startCheckout(workspaceId, { interval: 'monthly', currency: 'INR' }),
  ).toEqual(checkout);
});

it('refuses a malformed checkout from the server', async () => {
  for (const checkout of [
    { key: 'sk_live_SyntheticKey01', subscriptionId: 'sub_Synthetic000001' },
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
      'BILLING_CURRENCY_UNAVAILABLE',
      422,
      'That currency isn’t available. Choose INR.',
    ],
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

it('offers INR only unless the server confirms USD plans', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ currencies: ['INR', 'USD'] })),
  );
  expect(await fetchBillingOptions()).toEqual(['INR', 'USD']);
  for (const reply of [
    Response.json({ currencies: ['INR'] }),
    Response.json({ currencies: [] }),
    Response.json({ currencies: ['EUR'] }),
    Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 }),
  ]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply));
    expect(await fetchBillingOptions()).toEqual(['INR']);
  }
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  expect(await fetchBillingOptions()).toEqual(['INR']);
});

it('asks the server for the pending subscription before opening a card change', async () => {
  const checkout = {
    key: 'rzp_live_SyntheticKey01',
    subscriptionId: 'sub_Synthetic000001',
  };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ checkout }));
  vi.stubGlobal('fetch', fetcher);
  expect(await startCardUpdate(workspaceId)).toEqual(checkout);
  const [path, init] = fetcher.mock.calls[0];
  expect(path).toBe(`/api/v1/workspaces/${workspaceId}/billing/card`);
  expect(init).toMatchObject({ method: 'POST', body: '{}' });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'BILLING_NOT_PENDING' } },
          { status: 409 },
        ),
      ),
  );
  await expect(startCardUpdate(workspaceId)).rejects.toThrow(
    'Your last payment went through, so there’s no card to update.',
  );
});

it('sends an owner to the card change instead of a second checkout', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'BILLING_PAYMENT_PENDING' } },
          { status: 409 },
        ),
      ),
  );
  await expect(
    startCheckout(workspaceId, { interval: 'monthly', currency: 'INR' }),
  ).rejects.toThrow(
    'Razorpay is retrying your last payment. Update your card instead.',
  );
});
