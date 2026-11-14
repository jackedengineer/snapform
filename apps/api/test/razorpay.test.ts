import { SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import type { BillingEvent } from '@snapform/contracts/billing-server';
import {
  cancelSubscription,
  createSubscription,
  razorpayConfig,
} from '../src/razorpay.ts';
import {
  handleRazorpayWebhook,
  razorpayWebhookPath,
} from '../src/billing-webhook.ts';
import type { AuthEnvironment } from '../src/environment.ts';

// Synthetic test-mode values; the same ones are bound in vitest.config.ts.
const settings = {
  RAZORPAY_MODE: 'test',
  RAZORPAY_KEY_ID: 'rzp_test_SyntheticKey01',
  RAZORPAY_KEY_SECRET: 'synthetic-test-secret',
  RAZORPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret',
  RAZORPAY_PLAN_PRO_MONTHLY_INR: 'plan_SyntheticMonINR',
  RAZORPAY_PLAN_PRO_MONTHLY_USD: 'plan_SyntheticMonUSD',
  RAZORPAY_PLAN_PRO_ANNUAL_INR: 'plan_SyntheticAnnINR',
  RAZORPAY_PLAN_PRO_ANNUAL_USD: 'plan_SyntheticAnnUSD',
};
const environment = settings as unknown as AuthEnvironment;
const configured = razorpayConfig(environment);
if (!configured) throw Error('Synthetic Razorpay configuration required');
const config = configured;
const workspaceId = '28765529-6337-4512-b148-f735ad07d28b';

/** A minimal fake of the documented Subscriptions API: create, then cancel. */
function fakeRazorpay() {
  const created = new Map<string, { plan_id: string; status: string }>();
  const calls: { url: string; auth: string | null; body: unknown }[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const body: unknown = await request.json();
      calls.push({
        url: request.url,
        auth: request.headers.get('authorization'),
        body,
      });
      const expected = 'Basic ' + btoa(`${config.keyId}:${config.keySecret}`);
      if (request.headers.get('authorization') !== expected)
        return Response.json(
          { error: { code: 'BAD_REQUEST_ERROR' } },
          { status: 401 },
        );
      const cancel = request.url.match(/subscriptions\/(sub_\w+)\/cancel$/);
      if (cancel) {
        const subscription = created.get(cancel[1]);
        if (!subscription)
          return Response.json(
            { error: { code: 'BAD_REQUEST_ERROR' } },
            { status: 400 },
          );
        return Response.json({ id: cancel[1], status: subscription.status });
      }
      const id = 'sub_Fake' + String(created.size).padStart(10, '0');
      const { plan_id } = body as { plan_id: string };
      created.set(id, { plan_id, status: 'created' });
      return Response.json({
        id,
        entity: 'subscription',
        plan_id,
        status: 'created',
      });
    },
  );
  return { fetcher: fetcher as typeof fetch, calls, created };
}
async function signed(
  body: string,
  eventId = 'evt_Synthetic01',
  key = settings.RAZORPAY_WEBHOOK_SECRET,
) {
  const hmac = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(body)),
  );
  return new Request('https://snapform.example' + razorpayWebhookPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': [...digest]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
      'X-Razorpay-Event-Id': eventId,
    },
    body,
  });
}
function event(
  type: string,
  subscription = 'sub_Fake0000000000',
  created = 1794579000,
) {
  return JSON.stringify({
    entity: 'event',
    event: type,
    created_at: created,
    payload: {
      subscription: {
        entity: {
          id: subscription,
          plan_id: 'plan_SyntheticMonINR',
          customer_id: 'cust_Synthetic00001',
          status: 'active',
          current_start: 1794579000,
          current_end: 1797257400,
          notes: { workspace_id: workspaceId },
        },
      },
    },
  });
}

describe('Subscriptions API client', () => {
  it('creates a test-mode subscription for the chosen plan with workspace notes', async () => {
    const razorpay = fakeRazorpay();
    expect(
      await createSubscription(
        config,
        { interval: 'annual', currency: 'USD' },
        workspaceId,
        razorpay.fetcher,
      ),
    ).toBe('sub_Fake0000000000');
    expect(razorpay.calls[0]).toMatchObject({
      url: 'https://api.razorpay.com/v1/subscriptions',
      body: {
        plan_id: 'plan_SyntheticAnnUSD',
        total_count: 10,
        notes: { workspace_id: workspaceId },
      },
    });
  });
  it('cancels at the end of the paid cycle, never immediately', async () => {
    const razorpay = fakeRazorpay();
    const id = await createSubscription(
      config,
      { interval: 'monthly', currency: 'INR' },
      workspaceId,
      razorpay.fetcher,
    );
    await cancelSubscription(config, id, razorpay.fetcher);
    expect(razorpay.calls[1]).toEqual({
      url: `https://api.razorpay.com/v1/subscriptions/${id}/cancel`,
      auth: 'Basic ' + btoa(`${config.keyId}:${config.keySecret}`),
      body: { cancel_at_cycle_end: true },
    });
  });
  it('never creates a subscription for a currency without a plan in this mode', async () => {
    const razorpay = fakeRazorpay();
    await expect(
      createSubscription(
        {
          ...config,
          currencies: ['INR'],
          plans: {
            monthly: { INR: 'plan_SyntheticMonINR' },
            annual: { INR: 'plan_SyntheticAnnINR' },
          },
        },
        { interval: 'monthly', currency: 'USD' },
        workspaceId,
        razorpay.fetcher,
      ),
    ).rejects.toThrow('BILLING_CURRENCY_UNAVAILABLE');
    expect(razorpay.calls).toEqual([]);
  });
  it('reports provider failures without leaking provider responses', async () => {
    const razorpay = fakeRazorpay();
    await expect(
      cancelSubscription(config, 'sub_Unknown00000001', razorpay.fetcher),
    ).rejects.toThrow('BILLING_PROVIDER_UNAVAILABLE');
    await expect(
      createSubscription(
        { ...config, keySecret: 'wrong-secret' },
        { interval: 'monthly', currency: 'USD' },
        workspaceId,
        razorpay.fetcher,
      ),
    ).rejects.toThrow('BILLING_PROVIDER_UNAVAILABLE');
    await expect(
      createSubscription(
        config,
        { interval: 'monthly', currency: 'USD' },
        workspaceId,
        async () => Response.json({ id: 'plan_notASubscription' }),
      ),
    ).rejects.toThrow('BILLING_PROVIDER_UNAVAILABLE');
    await expect(
      createSubscription(
        config,
        { interval: 'monthly', currency: 'USD' },
        workspaceId,
        async () => {
          throw new TypeError('network down');
        },
      ),
    ).rejects.toThrow('BILLING_PROVIDER_UNAVAILABLE');
  });
});

describe('webhook', () => {
  it('applies a verified subscription lifecycle once per event ID', async () => {
    const applied: BillingEvent[] = [];
    const seen = new Set<string>();
    const apply = async (value: BillingEvent) => {
      if (seen.has(value.id)) return 'duplicate' as const;
      seen.add(value.id);
      applied.push(value);
      return 'applied' as const;
    };
    const razorpay = fakeRazorpay();
    const id = await createSubscription(
      config,
      { interval: 'monthly', currency: 'INR' },
      workspaceId,
      razorpay.fetcher,
    );
    for (const [type, eventId] of [
      ['subscription.activated', 'evt_A'],
      ['subscription.charged', 'evt_B'],
      ['subscription.charged', 'evt_B'],
      ['subscription.halted', 'evt_C'],
      ['subscription.cancelled', 'evt_D'],
      ['subscription.completed', 'evt_E'],
    ] as const) {
      const response = await handleRazorpayWebhook(
        await signed(event(type, id), eventId),
        environment,
        apply,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(applied.map((value) => value.type)).toEqual([
      'subscription.activated',
      'subscription.charged',
      'subscription.halted',
      'subscription.cancelled',
      'subscription.completed',
    ]);
    expect(applied[0]).toMatchObject({
      workspaceId,
      subscriptionId: id,
      interval: 'monthly',
      currency: 'INR',
      periodEnd: new Date(1797257400 * 1000),
    });
  });
  it('rejects forged, malformed and oversized deliveries before applying', async () => {
    const apply = vi.fn();
    const body = event('subscription.activated');
    const forged = await signed(body, 'evt_F', 'attacker-secret');
    expect(
      (await handleRazorpayWebhook(forged, environment, apply)).status,
    ).toBe(401);
    const unsigned = new Request(forged.url, { method: 'POST', body });
    expect(
      (await handleRazorpayWebhook(unsigned, environment, apply)).status,
    ).toBe(401);
    expect(
      (
        await handleRazorpayWebhook(
          await signed('{not json', 'evt_G'),
          environment,
          apply,
        )
      ).status,
    ).toBe(400);
    expect(
      (await handleRazorpayWebhook(await signed(body, ''), environment, apply))
        .status,
    ).toBe(400);
    const huge = await signed(
      ' '.repeat(1048577 - body.length) + body,
      'evt_H',
    );
    expect((await handleRazorpayWebhook(huge, environment, apply)).status).toBe(
      413,
    );
    // A streamed body without Content-Length is cut off at the same limit.
    const streamed = await signed(
      ' '.repeat(1048577 - body.length) + body,
      'evt_H',
    );
    const chunks = new Blob([await streamed.arrayBuffer()]).stream();
    const headers = new Headers(streamed.headers);
    headers.delete('content-length');
    expect(
      (
        await handleRazorpayWebhook(
          new Request(streamed.url, {
            method: 'POST',
            headers,
            body: chunks,
            duplex: 'half',
          } as RequestInit),
          environment,
          apply,
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await handleRazorpayWebhook(
          new Request(forged.url, { method: 'GET' }),
          environment,
          apply,
        )
      ).status,
    ).toBe(405);
    expect(apply).not.toHaveBeenCalled();
  });
  it('accepts a signed body of exactly 1 MiB', async () => {
    const apply = vi.fn(async () => 'applied' as const);
    const body = event('subscription.charged');
    const response = await handleRazorpayWebhook(
      await signed(body + ' '.repeat(1048576 - body.length), 'evt_L'),
      environment,
      apply,
    );
    expect(response.status).toBe(200);
    expect(apply).toHaveBeenCalledOnce();
  });
  it('acknowledges unknown events with 200 and only records them for dedupe', async () => {
    const seen: BillingEvent[] = [];
    const apply = async (value: BillingEvent) => {
      seen.push(value);
      return 'ignored' as const;
    };
    for (const [type, eventId] of [
      ['payment.captured', 'evt_M'],
      ['subscription.updated', 'evt_N'],
      ['refund.processed', 'evt_O'],
    ]) {
      const response = await handleRazorpayWebhook(
        await signed(
          JSON.stringify({
            entity: 'event',
            event: type,
            created_at: 1794579000,
            payload: { payment: { entity: { id: 'pay_Synthetic01' } } },
          }),
          eventId,
        ),
        environment,
        apply,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ outcome: 'ignored' });
    }
    expect(seen).toMatchObject([
      { type: 'payment.captured', subscriptionId: null, workspaceId: null },
      { type: 'subscription.updated', subscriptionId: null },
      { type: 'refund.processed', subscriptionId: null },
    ]);
  });
  it('never logs customer, payment or subscription details', async () => {
    const lines: string[] = [];
    const capture = (...values: unknown[]) => {
      lines.push(values.map(String).join(' '));
    };
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(capture),
    );
    try {
      const body = JSON.stringify({
        entity: 'event',
        event: 'subscription.charged',
        created_at: 1794579000,
        payload: {
          subscription: {
            entity: {
              ...JSON.parse(event('subscription.charged')).payload.subscription
                .entity,
              id: 'sub_PrivateSub00001',
              customer_id: 'cust_PrivateCust001',
            },
          },
          payment: {
            entity: {
              id: 'pay_PrivatePay00001',
              email: 'payer@example.invalid',
              contact: '+919999999999',
              card: { last4: '4242' },
            },
          },
        },
      });
      const failing = async () => {
        throw new Error('database unavailable cust_PrivateCust001');
      };
      await handleRazorpayWebhook(
        await signed(body, 'evt_P'),
        environment,
        failing,
      );
      await handleRazorpayWebhook(
        await signed(body, 'evt_Q', 'attacker-secret'),
        environment,
        failing,
      );
      await handleRazorpayWebhook(
        await signed(body.replace('1794579000', '"x"'), 'evt_R'),
        environment,
        failing,
      );
      await handleRazorpayWebhook(
        await signed(body, 'evt_S'),
        environment,
        async () => 'applied' as const,
      );
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const secret of [
      'sub_PrivateSub00001',
      'cust_PrivateCust001',
      'pay_PrivatePay00001',
      'payer@example.invalid',
      '9999999999',
      '4242',
      workspaceId,
      'synthetic-webhook-secret',
    ])
      expect(lines.join('\n')).not.toContain(secret);
  });
  it('asks Razorpay to retry when the event cannot be recorded', async () => {
    const response = await handleRazorpayWebhook(
      await signed(event('subscription.charged'), 'evt_I'),
      environment,
      async () => {
        throw new Error('database unavailable');
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 'BILLING_EVENT_UNCONFIRMED' },
    });
  });
  it('says billing is not configured instead of accepting events', async () => {
    const response = await handleRazorpayWebhook(
      await signed(event('subscription.charged'), 'evt_J'),
      {} as AuthEnvironment,
      vi.fn(),
    );
    expect(response.status).toBe(503);
  });
  it('verifies signatures at the real Worker boundary before any database work', async () => {
    const forged = await signed(
      event('subscription.activated'),
      'evt_K',
      'attacker-secret',
    );
    const rejected = await SELF.fetch(forged);
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get('Cache-Control')).toBe('no-store');
    expect(await rejected.json()).toEqual({
      error: { code: 'SIGNATURE_INVALID' },
    });
  });
});
