import { expect, it, vi } from 'vitest';
import { dispatchWebhooks } from '../src/webhook-dispatch';
import {
  createWebhookSecret,
  sealWebhookDestination,
} from '@snapform/contracts/webhook-crypto';
import type { WebhookClaim } from '@snapform/database/webhook-attempts';
import { formFixture } from '../../../packages/contracts/test/form-fixture';
import { createWebhookPayload } from '@snapform/contracts/webhook-payload';

const master = btoa('0123456789abcdef0123456789abcdef');
async function fixture() {
  const context = {
    workspaceId: crypto.randomUUID(),
    formId: crypto.randomUUID(),
    configurationId: crypto.randomUUID(),
  };
  const claim: WebhookClaim = {
    ...context,
    id: crypto.randomUUID(),
    leaseToken: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    sessionId: null,
    kind: 'test',
    attempts: 2,
    createdAt: new Date().toISOString(),
    payload: '{"exact":"☃"}\n',
    snapshot: null,
    sealedDestination: await sealWebhookDestination(
      { url: 'https://hooks.example.com/qa', secret: createWebhookSecret() },
      master,
      context,
    ),
  };
  return claim;
}
it('prepares a pinned real response once before sending and does no work for an empty claim', async () => {
  const original = await fixture(),
    { definition, ids } = formFixture();
  const claim: WebhookClaim = {
    ...original,
    kind: 'response.submitted',
    payload: null,
    snapshot: {
      id: crypto.randomUUID(),
      versionId: original.versionId,
      version: 3,
      submittedAt: original.createdAt,
      definition,
      answers: {
        [ids.budget]: { state: 'value', value: 0 },
        [ids.contact]: { state: 'value', value: 'qa@example.invalid' },
      },
    },
  };
  const prepared: string[] = [],
    send = vi.fn(async (delivery) => {
      expect(delivery.body).toBe(prepared[0]);
      return {
        status: 'retry' as const,
        httpStatus: 503,
        reason: 'receiver-unavailable' as const,
        delaySeconds: 60,
      };
    });
  const commands = {
    master,
    claim: async () => [claim],
    send,
    prepare: async (_: WebhookClaim, body: string | null) => {
      expect(body).toBe(
        createWebhookPayload(
          { id: claim.id, formId: claim.formId, createdAt: claim.createdAt },
          claim.snapshot!,
          false,
        ),
      );
      prepared.push(body!);
      return true;
    },
    record: async () => true,
  };
  expect((await dispatchWebhooks(commands)).retry).toBe(1);
  send.mockClear();
  expect(
    (await dispatchWebhooks({ ...commands, claim: async () => [] })).claimed,
  ).toBe(0);
  expect(send).not.toHaveBeenCalled();
});
it('revalidates stored bytes before HTTP and counts acknowledgment only after persistence', async () => {
  const claim = await fixture(),
    order: string[] = [];
  const result = await dispatchWebhooks({
    master,
    claim: async () => [claim],
    prepare: async (value, body) => {
      expect(value).toBe(claim);
      expect(body).toBeNull();
      order.push('prepare');
      return true;
    },
    send: async (delivery) => {
      expect(delivery.body).toBe(claim.payload);
      expect(delivery.id).toBe(claim.id);
      expect(delivery.attempts).toBe(2);
      order.push('send');
      return { status: 'acknowledged', httpStatus: 204 };
    },
    record: async (_, outcome) => {
      expect(outcome.status).toBe('acknowledged');
      order.push('record');
      return true;
    },
  });
  expect(order).toEqual(['prepare', 'send', 'record']);
  expect(result).toEqual({
    claimed: 1,
    acknowledged: 1,
    retry: 0,
    unknown: 0,
    needs_action: 0,
    stale: 0,
    failed: 0,
  });
});
it('does no HTTP for invalid encryption, missing snapshots, or rejected preparation', async () => {
  const original = await fixture();
  for (const [claim, reason] of [
    [{ ...original, sealedDestination: 'invalid' }, 'configuration'],
    [{ ...original, payload: null }, 'payload-invalid'],
    [original, 'payload-invalid'],
  ] as const) {
    const send = vi.fn(),
      record = vi.fn(async () => true);
    const result = await dispatchWebhooks({
      master,
      claim: async () => [claim],
      prepare: async () => false,
      send,
      record,
    });
    expect(send).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(claim, {
      status: 'needs_action',
      reason,
      httpStatus: null,
    });
    expect(result.needs_action).toBe(1);
  }
});
it('keeps thrown sends unknown, fenced records stale, and database failures unacknowledged without resending', async () => {
  const claim = await fixture(),
    send = vi.fn(async () => {
      throw Error('private response');
    });
  const record = vi.fn(async () => true);
  const commands = {
    master,
    claim: async () => [claim],
    prepare: async () => true,
    send,
    record,
  };
  expect((await dispatchWebhooks(commands)).unknown).toBe(1);
  expect(record).toHaveBeenCalledWith(claim, {
    status: 'unknown',
    reason: 'receiver-unconfirmed',
    httpStatus: null,
  });
  expect(
    (await dispatchWebhooks({ ...commands, record: async () => false })).stale,
  ).toBe(1);
  send.mockClear();
  expect(
    (
      await dispatchWebhooks({
        ...commands,
        record: async () => {
          throw Error('database unavailable');
        },
      })
    ).failed,
  ).toBe(1);
  expect(send).toHaveBeenCalledOnce();
  send.mockClear();
  expect(
    (
      await dispatchWebhooks({
        ...commands,
        prepare: async () => {
          throw Error('database unavailable');
        },
      })
    ).failed,
  ).toBe(1);
  expect(send).not.toHaveBeenCalled();
});
