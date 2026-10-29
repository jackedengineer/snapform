import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake, mutateIntake } from '../src/intake.ts';
import { saveWebhookConfiguration } from '../src/webhook-settings.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
// Operator-only: one shared database, one transaction, always rolled back.
if (!process.env.DATABASE_MIGRATION_URL)
  throw Error('Local operator configuration required');
const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL);
const actor = crypto.randomUUID(),
  formId = crypto.randomUUID(),
  configurationId = crypto.randomUUID();
const master = Buffer.alloc(32, 7).toString('base64'),
  rollback = Error('Expected webhook intent rollback');
let rolledBack = false;
try {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: actor,
        name: 'Webhook intent QA',
        email: `${actor}@example.invalid`,
        emailVerified: true,
      });
      const workspace = await createWorkspace(tx, actor, {
        id: crypto.randomUUID(),
        name: 'Webhook intent QA',
        segment: 'agency',
      });
      const { definition, ids } = formFixture();
      await createForm(tx, actor, workspace.id, { id: formId, definition });
      const publication = await publishForm(tx, actor, workspace.id, formId, {
        versionId: crypto.randomUUID(),
        expectedRevision: 1,
      });
      const published = publication.publication;
      assert(published);
      const publicId = published.publicId;
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
      const submit = async () => {
        const id = crypto.randomUUID(),
          hash = id.replaceAll('-', '').repeat(2);
        const input = {
          operationId: crypto.randomUUID(),
          expectedRevision: 1,
          answers: {
            [ids.budget]: { state: 'value' as const, value: 0 },
            [ids.contact]: {
              state: 'value' as const,
              value: 'qa@example.invalid',
            },
          },
        };
        await startIntake(tx, publicId, id, hash);
        await mutateIntake(tx, publicId, id, hash, 'submit', input);
        return { id, hash, input };
      };
      const rows = async () =>
        (
          await tx.execute<{
            id: string;
            event_id: string;
            session_id: string;
            configuration_id: string;
            status: string;
            reason: string | null;
            attempts: number;
            payload: string | null;
            lease_token: string | null;
          }>(
            sql`select id,event_id,session_id,configuration_id,status,reason,attempts,payload,lease_token from public.webhook_delivery where form_id=${formId}::uuid order by created_at,id`,
          )
        ).rows;
      await submit();
      assert.equal((await rows()).length, 0, 'Off does not backfill delivery');
      // Simulate only the trusted receipt's verification fact inside this rollback fixture.
      await tx.execute(
        sql`update public.webhook_configuration set verified_at=now() where id=${configurationId}::uuid`,
      );
      await tx.execute(
        sql`update public.form_webhook_settings set enabled=true,revision=2 where form_id=${formId}::uuid`,
      );
      const first = await submit();
      const [intent] = await rows();
      assert(
        intent,
        'A submitted outbox event must create a webhook intent atomically',
      );
      assert.equal(intent.session_id, first.id);
      assert.equal(intent.configuration_id, configurationId);
      assert.equal(intent.status, 'pending');
      assert.equal(intent.payload, null);
      assert.equal(intent.attempts, 0);
      await mutateIntake(
        tx,
        publicId,
        first.id,
        first.hash,
        'submit',
        first.input,
      );
      assert.equal(
        (await rows()).length,
        1,
        'Repeated submit retains one delivery identity',
      );
      await tx.execute(
        sql`update public.form_webhook_settings set enabled=false,revision=3 where form_id=${formId}::uuid`,
      );
      assert.deepEqual(
        (await rows()).map((row) => ({
          status: row.status,
          reason: row.reason,
        })),
        [{ status: 'cancelled', reason: 'disabled' }],
      );
      await tx.execute(
        sql`update public.form_webhook_settings set enabled=true,revision=4 where form_id=${formId}::uuid`,
      );
      const second = await submit();
      assert.equal(
        (await rows()).find((row) => row.session_id === second.id)?.status,
        'pending',
      );
      // Simulate trusted in-flight/acknowledged facts without any external send.
      await tx.execute(
        sql`update public.webhook_delivery set status='sending',attempts=1,first_attempt_at=now(),lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',payload='{}' where session_id=${second.id}::uuid`,
      );
      const third = await submit();
      await tx.execute(
        sql`update public.webhook_delivery set status='acknowledged',attempts=1,first_attempt_at=now(),acknowledged_at=now(),payload='{}' where session_id=${third.id}::uuid`,
      );
      await saveWebhookConfiguration(
        tx,
        actor,
        workspace.id,
        formId,
        {
          configurationId: crypto.randomUUID(),
          expectedRevision: 4,
          url: 'https://hooks.example.com/new-version',
        },
        master,
      );
      const cancelled = await rows();
      assert.equal(cancelled.length, 3);
      assert.deepEqual(
        cancelled.find((row) => row.session_id === first.id),
        { ...intent, status: 'cancelled', reason: 'disabled' },
      );
      assert.equal(
        cancelled.find((row) => row.session_id === second.id)?.reason,
        'configuration-changed',
      );
      assert.equal(
        cancelled.find((row) => row.session_id === second.id)?.lease_token,
        null,
      );
      assert.equal(
        cancelled.find((row) => row.session_id === third.id)?.status,
        'acknowledged',
        'Endpoint edits preserve acknowledged history',
      );
      assert(
        cancelled.every((row) => row.configuration_id === configurationId),
        'Old jobs never retarget',
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
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
  console.log(
    'Webhook intents: future-only, atomic identity, duplicate submission, disable/re-enable, immutable destination verified; all fixtures rolled back; no network sends.',
  );
} finally {
  await close();
}
