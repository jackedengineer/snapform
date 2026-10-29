import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake, mutateIntake } from '../src/intake.ts';
import { saveWebhookConfiguration } from '../src/webhook-settings.ts';
import { createWebhookPayload } from '../../contracts/src/webhook-payload.ts';
import {
  claimWebhooks,
  prepareWebhookPayload,
  recordWebhookAttempt,
} from '../src/webhook-attempts.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
if (!process.env.DATABASE_MIGRATION_URL)
  throw Error('Local operator configuration required');
const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL),
  rollback = Error('Expected attempt fixture rollback');
const actor = crypto.randomUUID(),
  formId = crypto.randomUUID(),
  configurationId = crypto.randomUUID();
let stage = 'setup',
  rolledBack = false;
try {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: actor,
        name: 'Webhook attempts QA',
        email: `${actor}@example.invalid`,
        emailVerified: true,
      });
      const workspace = await createWorkspace(tx, actor, {
        id: crypto.randomUUID(),
        name: 'Webhook attempts QA',
        segment: 'agency',
      });
      const { definition, ids } = formFixture(),
        master = Buffer.alloc(32, 7).toString('base64');
      await createForm(tx, actor, workspace.id, { id: formId, definition });
      const published = (
        await publishForm(tx, actor, workspace.id, formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        })
      ).publication;
      assert(published);
      await saveWebhookConfiguration(
        tx,
        actor,
        workspace.id,
        formId,
        {
          configurationId,
          expectedRevision: 0,
          url: 'https://hooks.example.com/rollback-only',
        },
        master,
      );
      const answers = {
        [ids.budget]: { state: 'value' as const, value: 0 },
        [ids.contact]: { state: 'value' as const, value: 'qa@example.invalid' },
      };
      const at = new Date(
        (await tx.execute<{ at: Date }>(sql`select now() as at`)).rows[0].at,
      ).toISOString();
      const testId = crypto.randomUUID(),
        sample = {
          id: crypto.randomUUID(),
          versionId: published.versionId,
          version: 1,
          submittedAt: at,
          definition,
          answers,
        };
      const testBody = createWebhookPayload(
        { id: testId, formId, createdAt: at },
        sample,
        true,
      );
      // Simulate the explicit queue transition only; no network/provider success is fabricated.
      await tx.execute(
        sql`insert into public.webhook_delivery(id,workspace_id,form_id,configuration_id,version_id,kind,status,payload,created_by,created_at) values(${testId}::uuid,${workspace.id}::uuid,${formId}::uuid,${configurationId}::uuid,${published.versionId}::uuid,'test','pending',${testBody},${actor},${at}::timestamptz)`,
      );
      type Claim = {
        id: string;
        lease_token: string;
        payload: string | null;
        attempts: number;
      };
      const claim = async (id: string) =>
        (
          await tx.execute<Claim>(
            sql`select id,lease_token,payload,attempts from public.claim_webhooks(1,${id}::uuid)`,
          )
        ).rows;
      const prepare = async (item: Claim, body: string | null) =>
        (
          await tx.execute<{ ok: boolean }>(
            sql`select public.prepare_webhook_payload(${item.id}::uuid,${item.lease_token}::uuid,${body}) as ok`,
          )
        ).rows[0].ok;
      const record = async (
        item: Claim,
        status: string | null,
        http: number | null,
        reason: string | null,
        delay: number | null = 0,
      ) =>
        (
          await tx.execute<{ ok: boolean }>(
            sql`select public.record_webhook_attempt(${item.id}::uuid,${item.lease_token}::uuid,${status},${http}::integer,${reason},${delay}::integer) as ok`,
          )
        ).rows[0].ok;
      // Privileged state logic stays inside this owner rollback transaction.
      // Actual Jobs credentials/EXECUTE grants are checked separately below.
      stage = 'test claim and verification';

      const [mappedTest] = await claimWebhooks(tx, testId);
      assert(mappedTest);
      assert.equal(mappedTest.payload, testBody);
      assert.equal(mappedTest.snapshot, null);
      assert.equal(mappedTest.configurationId, configurationId);
      assert.equal(mappedTest.createdAt, at);
      assert.equal((await claim(testId)).length, 0);
      assert(await prepareWebhookPayload(tx, mappedTest, null));
      assert(
        await recordWebhookAttempt(tx, mappedTest, {
          status: 'acknowledged',
          httpStatus: 204,
        }),
      );

      assert.equal(
        (
          await tx.execute<{ verified: boolean }>(
            sql`select verified_at is not null as verified from public.webhook_configuration where id=${configurationId}::uuid`,
          )
        ).rows[0].verified,
        true,
      );
      await tx.execute(
        sql`update public.form_webhook_settings set enabled=true,revision=2 where form_id=${formId}::uuid`,
      );
      const submit = async () => {
        const id = crypto.randomUUID(),
          hash = id.replaceAll('-', '').repeat(2);
        await startIntake(tx, published.publicId, id, hash);
        await mutateIntake(tx, published.publicId, id, hash, 'submit', {
          operationId: crypto.randomUUID(),
          expectedRevision: 1,
          answers,
        });
        const row = (
          await tx.execute<{ id: string; created_at: Date }>(
            sql`select id,created_at from public.webhook_delivery where session_id=${id}::uuid`,
          )
        ).rows[0];
        assert(row);
        return {
          id: row.id,
          body: createWebhookPayload(
            {
              id: row.id,
              formId,
              createdAt: new Date(row.created_at).toISOString(),
            },
            { ...sample, id },
            false,
          ),
        };
      };
      stage = 'immutable prepare and retry';
      const delivery = await submit();

      const [mappedFirst] = await claimWebhooks(tx, delivery.id);
      assert(mappedFirst?.snapshot);
      assert.equal(mappedFirst.snapshot.version, 1);
      assert.equal(mappedFirst.snapshot.definition.title, definition.title);
      assert.deepEqual(mappedFirst.snapshot.answers, {
        ...answers,
        [ids.kind]: { state: 'missing' },
        [ids.detail]: { state: 'missing' },
      });
      assert.equal(
        createWebhookPayload(
          { id: mappedFirst.id, formId, createdAt: mappedFirst.createdAt },
          mappedFirst.snapshot,
          false,
        ),
        delivery.body,
      );
      const first = { ...mappedFirst, lease_token: mappedFirst.leaseToken };
      assert.equal(first.attempts, 1);
      assert.equal(await record(first, null, null, null), false);
      assert.equal(
        await record(first, 'retry', 503, 'receiver-unavailable', null),
        false,
      );
      assert.equal((await claim(delivery.id)).length, 0);
      assert.equal(
        await record(first, 'acknowledged', 204, null),
        false,
        'No acknowledgement before payload is stored',
      );
      assert.equal(
        await prepare(
          first,
          delivery.body.replace(delivery.id, crypto.randomUUID()),
        ),
        false,
      );
      assert.equal(await prepare(first, 'not-json'), false);
      assert.equal(await prepare(first, '{"invalid":"\\ud800"}'), false);
      const wrongShape = JSON.parse(delivery.body);
      wrongShape.data.answers = {};
      assert.equal(await prepare(first, JSON.stringify(wrongShape)), false);
      assert(await prepare(first, delivery.body));
      assert(await prepare(first, delivery.body));
      assert.equal(
        await prepare(first, delivery.body + ' '),
        false,
        'Stored bytes are immutable',
      );
      assert.equal(
        await record(
          { ...first, lease_token: crypto.randomUUID() },
          'acknowledged',
          204,
          null,
        ),
        false,
      );
      assert(await record(first, 'retry', 503, 'receiver-unavailable', 60));
      assert.equal(
        (await claim(delivery.id)).length,
        0,
        'Backoff cannot be skipped',
      );

      await tx.execute(
        sql`update public.webhook_delivery set available_at=now() where id=${delivery.id}::uuid`,
      );

      const [second] = await claim(delivery.id);
      assert(second);
      assert.equal(second.attempts, 2);
      assert(
        second.lease_token !== first.lease_token,
        'Each claim has a new fenced lease',
      );
      assert(
        second.payload === delivery.body,
        'Retry bytes and identity stay unchanged',
      );
      assert(await prepare(second, null));
      assert(await record(second, 'acknowledged', 200, null));
      assert.equal(await record(first, 'acknowledged', 204, null), false);
      assert.equal(await record(second, 'acknowledged', 200, null), false);
      stage = 'expired in-flight becomes unknown';

      const expired = await submit();

      const [old] = await claim(expired.id);
      assert(old);

      await tx.execute(
        sql`update public.webhook_delivery set lease_until=now()-interval '1 second' where id=${old.id}::uuid`,
      );

      assert.equal(
        (await claim(old.id)).length,
        0,
        'An expired request is never automatically resent',
      );
      assert.equal(await record(old, 'acknowledged', 200, null), false);

      assert.deepEqual(
        (
          await tx.execute(
            sql`select status,reason,attempts from public.webhook_delivery where id=${old.id}::uuid`,
          )
        ).rows,
        [{ status: 'unknown', reason: 'receiver-unconfirmed', attempts: 1 }],
      );
      stage = 'settings fence in-flight outcomes';
      const changed = await submit();

      const [lease] = await claim(changed.id);
      assert(lease);

      await saveWebhookConfiguration(
        tx,
        actor,
        workspace.id,
        formId,
        {
          configurationId: crypto.randomUUID(),
          expectedRevision: 2,
          url: 'https://hooks.example.com/new',
        },
        master,
      );

      assert.equal(await prepare(lease, changed.body), false);
      assert.equal(await record(lease, 'acknowledged', 200, null), false);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) {
      if (error instanceof Error && error.name === 'AssertionError')
        throw error;
      const code =
        error instanceof Error &&
        typeof error.cause === 'object' &&
        error.cause !== null &&
        'code' in error.cause
          ? String(error.cause.code)
          : 'unknown';
      throw Error(
        `Webhook attempt verification failed at ${stage} (SQL state ${/^[0-9A-Z]{5}$/.test(code) ? code : 'unavailable'})`,
        { cause: error },
      );
    }
    rolledBack = true;
  }
  assert(rolledBack);
  assert.equal(
    (
      await db.execute(
        sql`select id from public.webhook_delivery where form_id=${formId}::uuid`,
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.execute(sql`select id from public."user" where id=${actor}`)).rows
      .length,
    0,
  );
  const jobConfig = parseEnv(
    await readFile(
      new URL('../../../apps/jobs/.dev.vars', import.meta.url),
      'utf8',
    ),
  );
  if (
    !jobConfig.DATABASE_URL ||
    new URL(jobConfig.DATABASE_URL).username !== 'snapform_jobs'
  )
    throw Error('Restricted job configuration required');
  const jobConnection = await openDatabase(jobConfig.DATABASE_URL);
  try {
    assert.deepEqual(
      (
        await jobConnection.db.execute(
          sql`select current_user as actor,has_function_privilege(current_user,'public.claim_webhooks(integer,uuid)','EXECUTE') as claim,has_function_privilege(current_user,'public.prepare_webhook_payload(uuid,uuid,text)','EXECUTE') as prepare,has_function_privilege(current_user,'public.record_webhook_attempt(uuid,uuid,text,integer,text,integer)','EXECUTE') as record`,
        )
      ).rows,
      [{ actor: 'snapform_jobs', claim: true, prepare: true, record: true }],
    );
  } finally {
    await jobConnection.close();
  }
  console.log(
    'Webhook attempt leases, immutable preparation, retry, verified test acknowledgement, expired Unknown and stale-result fences passed; all fixtures rolled back; no HTTP requests.',
  );
} finally {
  await close();
}
