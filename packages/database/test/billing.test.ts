import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { createForm } from '../src/forms.ts';
import { publishForm, unpublishForm } from '../src/publication.ts';
import { inWorkspace } from '../src/workspaces.ts';
import { membership } from '../src/workspace-schema.ts';
import { user } from '../src/schema.ts';
import { workspacePlan, billingEvent } from '../src/billing-schema.ts';
import {
  applyBillingEvent,
  getBilling,
  markCancellation,
  recordSubscription,
} from '../src/billing.ts';
import type { BillingEvent } from '../../contracts/src/billing-server.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
import { seedForm } from './fixtures/forms.ts';

type Seed = Awaited<ReturnType<typeof seedForm>>;
async function fixture(run: (tx: Transaction, seed: Seed) => Promise<void>) {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL),
    rollback = new Error('Rollback billing fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        await run(tx, await seedForm(tx, 'Billing QA'));
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}
async function publishNew(tx: Transaction, seed: Seed, formId?: string) {
  const id = formId ?? crypto.randomUUID();
  if (!formId)
    await createForm(tx, seed.actor, seed.workspaceId, {
      id,
      definition: formFixture().definition,
    });
  const receipt = await publishForm(tx, seed.actor, seed.workspaceId, id, {
    versionId: crypto.randomUUID(),
    expectedRevision: 1,
  });
  return { formId: id, ...receipt };
}
const day = 86400000;
function event(seed: Seed, overrides: Partial<BillingEvent>): BillingEvent {
  return {
    id: 'evt_' + crypto.randomUUID().replaceAll('-', ''),
    type: 'subscription.activated',
    createdAt: new Date(Date.now() - 60000),
    workspaceId: seed.workspaceId,
    subscriptionId:
      'sub_QA' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
    customerId: 'cust_QA0000000001',
    interval: 'monthly',
    currency: 'INR',
    periodStart: new Date(Date.now() - day),
    periodEnd: new Date(Date.now() + 29 * day),
    ...overrides,
  };
}

it(
  'starts every existing workspace on Free with readable usage',
  async () =>
    fixture(async (tx, seed) => {
      expect(await getBilling(tx, seed.actor, seed.workspaceId)).toMatchObject({
        role: 'owner',
        plan: 'free',
        status: 'none',
        responsesUsed: 0,
        responsesReserved: 0,
        responseLimit: 100,
        liveForms: 0,
        liveFormLimit: 3,
        seatsUsed: 1,
        seatLimit: 1,
        subscriptionId: null,
      });
      const { resetsAt } = await getBilling(tx, seed.actor, seed.workspaceId);
      expect(new Date(resetsAt).getUTCDate()).toBe(1);
      expect(new Date(resetsAt).getUTCHours()).toBe(0);
      await expect(
        getBilling(tx, crypto.randomUUID(), seed.workspaceId),
      ).rejects.toThrow('WORKSPACE_NOT_FOUND');
    }),
  30000,
);

it(
  'refuses a fourth live Free form but keeps republishing and frees a slot on unpublish',
  async () =>
    fixture(async (tx, seed) => {
      const first = await publishNew(tx, seed, seed.formId);
      const second = await publishNew(tx, seed);
      await publishNew(tx, seed);
      await expect(
        tx.transaction((attempt) => publishNew(attempt, seed)),
      ).rejects.toThrow('LIVE_FORM_LIMIT');
      // Republishing an already live form is an update, not a new live form.
      await expect(
        publishForm(tx, seed.actor, seed.workspaceId, seed.formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        }),
      ).resolves.toMatchObject({ publication: { active: true } });
      await unpublishForm(tx, seed.actor, seed.workspaceId, second.formId, {
        expectedVersionId: second.versionId,
      });
      await expect(publishNew(tx, seed)).resolves.toMatchObject({
        publication: { active: true },
      });
      expect(first.publication?.active).toBe(true);
      expect(
        (await getBilling(tx, seed.actor, seed.workspaceId)).liveForms,
      ).toBe(3);
    }),
  60000,
);

it(
  'grants Pro through a verified paid period and dedupes provider retries',
  async () =>
    fixture(async (tx, seed) => {
      const activated = event(seed, {});
      expect(await applyBillingEvent(tx, activated)).toBe('applied');
      expect(await applyBillingEvent(tx, activated)).toBe('duplicate');
      expect(await getBilling(tx, seed.actor, seed.workspaceId)).toMatchObject({
        plan: 'pro',
        status: 'active',
        interval: 'monthly',
        currency: 'INR',
        responseLimit: 2000,
        liveFormLimit: null,
        seatLimit: 3,
      });
      for (let index = 0; index < 5; index++) await publishNew(tx, seed);
      expect(
        (await getBilling(tx, seed.actor, seed.workspaceId)).liveForms,
      ).toBe(5);
    }),
  60000,
);

it(
  'treats an ended paid period, a foreign plan and an unknown workspace as Free',
  async () =>
    fixture(async (tx, seed) => {
      expect(
        await applyBillingEvent(
          tx,
          event(seed, {
            periodStart: new Date(Date.now() - 60 * day),
            periodEnd: new Date(Date.now() - 30 * day),
          }),
        ),
      ).toBe('applied');
      expect((await getBilling(tx, seed.actor, seed.workspaceId)).plan).toBe(
        'free',
      );
      expect(
        await applyBillingEvent(
          tx,
          event(seed, { interval: null, currency: null }),
        ),
      ).toBe('ignored');
      expect(
        await applyBillingEvent(
          tx,
          event(seed, { workspaceId: crypto.randomUUID() }),
        ),
      ).toBe('ignored');
      expect(
        await applyBillingEvent(
          tx,
          event(seed, { type: 'subscription.paused' }),
        ),
      ).toBe('ignored');
      expect((await getBilling(tx, seed.actor, seed.workspaceId)).plan).toBe(
        'free',
      );
    }),
  30000,
);

it(
  'keeps Pro until period end after cancellation, whatever order events arrive in',
  async () =>
    fixture(async (tx, seed) => {
      const activated = event(seed, {
        createdAt: new Date(Date.now() - 3 * 60000),
      });
      await applyBillingEvent(tx, activated);
      const renewed = new Date(Date.now() + 29 * day),
        later = new Date(Date.now() + 59 * day);
      expect(
        await applyBillingEvent(
          tx,
          event(seed, {
            type: 'subscription.cancelled',
            subscriptionId: activated.subscriptionId,
            createdAt: new Date(Date.now() - 60000),
            periodStart: null,
            periodEnd: null,
          }),
        ),
      ).toBe('applied');
      // An older renewal delivered late extends the paid period but not the status.
      expect(
        await applyBillingEvent(
          tx,
          event(seed, {
            type: 'subscription.charged',
            subscriptionId: activated.subscriptionId,
            createdAt: new Date(Date.now() - 2 * 60000),
            periodStart: renewed,
            periodEnd: later,
          }),
        ),
      ).toBe('applied');
      const billing = await getBilling(tx, seed.actor, seed.workspaceId);
      expect(billing).toMatchObject({ plan: 'pro', status: 'cancelled' });
      expect(billing.currentPeriodEnd).toBe(later.toISOString());
      expect(
        await applyBillingEvent(
          tx,
          event(seed, { type: 'subscription.halted', periodEnd: null }),
        ),
      ).toBe('ignored');
    }),
  30000,
);

it(
  'records checkout for owners only and refuses a second live subscription',
  async () =>
    fixture(async (tx, seed) => {
      const subscriptionId = 'sub_QAcheckout0001';
      await recordSubscription(
        tx,
        seed.actor,
        seed.workspaceId,
        subscriptionId,
        {
          interval: 'annual',
          currency: 'USD',
        },
      );
      expect(await getBilling(tx, seed.actor, seed.workspaceId)).toMatchObject({
        plan: 'free',
        status: 'created',
        interval: 'annual',
        subscriptionId: subscriptionId,
      });
      const editor = crypto.randomUUID();
      await tx.insert(user).values({
        id: editor,
        name: 'Billing editor QA',
        email: `${editor}@example.invalid`,
        emailVerified: true,
      });
      await inWorkspace(
        tx,
        seed.actor,
        seed.workspaceId,
        'members.manage',
        (scoped) =>
          scoped.insert(membership).values({
            workspaceId: seed.workspaceId,
            userId: editor,
            role: 'editor',
          }),
      );
      expect(
        (await getBilling(tx, editor, seed.workspaceId)).subscriptionId,
      ).toBeNull();
      await expect(
        recordSubscription(tx, editor, seed.workspaceId, 'sub_QAeditor00001', {
          interval: 'monthly',
          currency: 'INR',
        }),
      ).rejects.toThrow('FORBIDDEN');
      await applyBillingEvent(tx, event(seed, { subscriptionId }));
      await expect(
        tx.transaction((attempt) =>
          recordSubscription(
            attempt,
            seed.actor,
            seed.workspaceId,
            'sub_QAsecond00001',
            { interval: 'monthly', currency: 'INR' },
          ),
        ),
      ).rejects.toThrow('BILLING_ALREADY_ACTIVE');
      expect(
        await markCancellation(
          tx,
          seed.actor,
          seed.workspaceId,
          subscriptionId,
        ),
      ).toBe(true);
      expect(
        (await getBilling(tx, seed.actor, seed.workspaceId)).cancelAtPeriodEnd,
      ).toBe(true);
    }),
  30000,
);

it(
  'never exposes billing tables to the runtime role',
  async () =>
    fixture(async (tx) => {
      for (const table of [workspacePlan, billingEvent])
        await expect(
          tx.transaction((nested) => nested.select().from(table)),
        ).rejects.toMatchObject({ cause: { code: '42501' } });
      expect(
        (
          await tx.execute(
            sql`select has_function_privilege('snapform_runtime','public.workspace_plan_limits(uuid)','EXECUTE') as limits,
            has_function_privilege('snapform_jobs','public.apply_billing_event(text,text,timestamptz,uuid,text,text,text,text,timestamptz,timestamptz)','EXECUTE') as jobs_apply`,
          )
        ).rows,
      ).toEqual([{ limits: false, jobs_apply: false }]);
    }),
  30000,
);
