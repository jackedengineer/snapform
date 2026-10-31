import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { seedResponses } from '../test/fixtures/forms.ts';
import { configureEmailNotifications } from '../src/notification-settings.ts';
import { mutateIntake } from '../src/intake.ts';
import { scheduleDeletion, cancelDeletion } from '../src/deletion.ts';

// Operator-only, synthetic fixtures in one transaction; no provider calls.
if (!process.env.DATABASE_MIGRATION_URL)
  throw Error('Operator configuration required');
const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL);
const rollback = Error('Expected email guard rollback');
try {
  await db.transaction(async (tx) => {
    if (process.argv.includes('--candidate')) {
      const migration = await readFile(
        new URL('../migrations/0036_email-send-guard.sql', import.meta.url),
        'utf8',
      );
      await tx.execute(sql.raw(migration));
    }
    const f = await seedResponses(tx, 'Email send guard QA');
    await configureEmailNotifications(tx, f.actor, f.workspaceId, f.formId, {
      enabled: true,
      expectedRevision: 0,
    });
    await mutateIntake(tx, f.publicId, f.partial, 'e'.repeat(64), 'submit', {
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      answers: {
        [f.fieldIds.budget]: { state: 'value', value: 0 },
        [f.fieldIds.contact]: { state: 'value', value: 'qa@example.invalid' },
      },
    });
    const delivery = (
      await tx.execute<{ id: string }>(
        sql`select id from public.response_email_delivery where session_id=${f.partial}::uuid`,
      )
    ).rows[0];
    assert(delivery);
    const token = crypto.randomUUID();
    const lease = async () =>
      tx.execute(
        sql`update public.response_email_delivery set status='sending',reason=NULL,first_attempt_at=now(),lease_token=${token}::uuid,lease_until=clock_timestamp()+interval '2 minutes' where id=${delivery.id}::uuid`,
      );
    const prepare = async (requestedToken = token) =>
      (
        await tx.execute<{ allowed: boolean }>(
          sql`select public.prepare_owner_email(${delivery.id}::uuid,${requestedToken}::uuid) as allowed`,
        )
      ).rows[0].allowed;
    await lease();
    await tx.execute(
      sql`update public.response_email_delivery set first_attempt_at=clock_timestamp()-interval '24 hours' where id=${delivery.id}::uuid`,
    );
    assert.equal(
      await prepare(),
      false,
      'expired provider idempotency window denied',
    );
    await lease();
    assert.equal(
      await prepare(),
      true,
      'current verified recipient and lease allowed',
    );
    assert.equal(
      await prepare(crypto.randomUUID()),
      false,
      'forged lease denied',
    );
    await tx.execute(
      sql`update public.response_email_delivery set lease_until=clock_timestamp()-interval '1 second' where id=${delivery.id}::uuid`,
    );
    assert.equal(await prepare(), false, 'expired lease denied');
    await lease();
    await tx.execute(
      sql`update public."user" set email_verified=false where id=${f.actor}`,
    );
    assert.equal(await prepare(), false, 'verification revoked after claim');
    await tx.execute(
      sql`update public."user" set email_verified=true where id=${f.actor}`,
    );
    await lease();
    await tx.execute(
      sql`update public."user" set email=${`${crypto.randomUUID()}@example.invalid`} where id=${f.actor}`,
    );
    assert.equal(
      await prepare(),
      false,
      'changed email cannot receive the old snapshot',
    );
    await tx.execute(
      sql`update public."user" set email=${`${f.actor}@example.invalid`} where id=${f.actor}`,
    );
    await lease();
    const request = await scheduleDeletion(
      tx,
      f.actor,
      f.workspaceId,
      { kind: 'response', targetId: f.partial },
      {
        requestId: crypto.randomUUID(),
        confirmation: 'DELETE',
        acknowledgeDeletion: true,
      },
    );
    assert.equal(await prepare(), false, 'deletion cancels claimed work');
    // Even a stale scheduler must not revive work for a pending target.
    await lease();
    assert.equal(
      await prepare(),
      false,
      'pending deletion checked independently of lease',
    );
    await cancelDeletion(tx, f.actor, f.workspaceId, request.id, {
      expectedRevision: 1,
    });
    assert.equal(
      await prepare(),
      false,
      'cancellation does not revive cancelled delivery',
    );
    const workspaceRequest = await scheduleDeletion(
      tx,
      f.actor,
      f.workspaceId,
      { kind: 'workspace', targetId: f.workspaceId },
      {
        requestId: crypto.randomUUID(),
        confirmation: 'Email send guard QA',
        acknowledgeDeletion: true,
      },
    );
    await lease();
    assert.equal(
      await prepare(),
      false,
      'workspace deletion also blocks stale work',
    );
    await cancelDeletion(tx, f.actor, f.workspaceId, workspaceRequest.id, {
      expectedRevision: 1,
    });
    await lease();
    await tx.execute(
      sql`insert into public.purge_intent(workspace_id,kind,target_id,reason) values(${f.workspaceId}::uuid,'response',${f.partial}::uuid,'expired')`,
    );
    assert.equal(
      await prepare(),
      false,
      'durable purge intent blocks work independently of request',
    );
    const privileges = (
      await tx.execute(
        sql`select has_function_privilege('snapform_jobs','public.prepare_owner_email(uuid,uuid)','EXECUTE') as jobs,has_function_privilege('snapform_runtime','public.prepare_owner_email(uuid,uuid)','EXECUTE') as runtime`,
      )
    ).rows;
    assert.deepEqual(privileges, [{ jobs: true, runtime: false }]);
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) {
    const code =
      error &&
      typeof error === 'object' &&
      'cause' in error &&
      error.cause &&
      typeof error.cause === 'object' &&
      'code' in error.cause
        ? String(error.cause.code)
        : '';
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : `Email send guard verification failed (${/^[A-Z0-9]{5}$/.test(code) ? code : 'unclassified'}); fixtures rolled back.`,
    );
    process.exitCode = 1;
  } else
    console.log(
      'Pre-send authorization, lease fencing, recipient changes, deletion and purge guards passed; fixtures rolled back.',
    );
} finally {
  await close();
}
