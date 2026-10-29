import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace, inWorkspace } from '../src/workspaces.ts';
import { membership } from '../src/workspace-schema.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake, mutateIntake } from '../src/intake.ts';
import { configureEmailNotifications } from '../src/notification-settings.ts';
import { retryOwnerEmail } from '../src/notification-settings.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';

// Operator-only verification: one database, one transaction, always rolled back.
if (!process.env.DATABASE_MIGRATION_URL)
  throw Error('Local operator configuration required');
const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL);
const rollback = Error('Expected verification rollback');
try {
  const jobConfiguration = parseEnv(
    await readFile(
      new URL('../../../apps/jobs/.dev.vars', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(
    new URL(jobConfiguration.DATABASE_URL).username,
    'snapform_jobs',
  );
  const jobs = await openDatabase(jobConfiguration.DATABASE_URL);
  try {
    assert.deepEqual(
      (await jobs.db.execute(sql`select current_user as actor`)).rows,
      [{ actor: 'snapform_jobs' }],
    );
    assert.deepEqual(
      (
        await jobs.db.execute(
          sql`select * from public.claim_owner_emails(1,${crypto.randomUUID()}::uuid)`,
        )
      ).rows,
      [],
    );
  } finally {
    await jobs.close();
  }
  await db.transaction(async (tx) => {
    const actor = crypto.randomUUID(),
      formId = crypto.randomUUID(),
      email = `${actor}@example.invalid`;
    await tx.insert(user).values({
      id: actor,
      name: 'Email recovery verification',
      email,
      emailVerified: true,
    });
    const workspace = await createWorkspace(tx, actor, {
      id: crypto.randomUUID(),
      name: 'Recovery QA',
      segment: 'agency',
    });
    const { definition, ids } = formFixture();
    await createForm(tx, actor, workspace.id, { id: formId, definition });
    const published = await publishForm(tx, actor, workspace.id, formId, {
      versionId: crypto.randomUUID(),
      expectedRevision: 1,
    });
    assert(published.publication);
    await configureEmailNotifications(tx, actor, workspace.id, formId, {
      enabled: true,
      expectedRevision: 0,
    });
    const sessionId = crypto.randomUUID(),
      hash = sessionId.replaceAll('-', '').repeat(2);
    await startIntake(tx, published.publication.publicId, sessionId, hash);
    await mutateIntake(
      tx,
      published.publication.publicId,
      sessionId,
      hash,
      'submit',
      {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        answers: {
          [ids.budget]: { state: 'value', value: 0 },
          [ids.contact]: { state: 'value', value: 'qa@example.invalid' },
        },
      },
    );
    const delivery = (
      await tx.execute<{ id: string }>(
        sql`select id from public.response_email_delivery where session_id=${sessionId}::uuid`,
      )
    ).rows[0];
    assert(delivery);
    const claim = async () =>
      (
        await tx.execute<{
          id: string;
          lease_token: string;
          recipient: string;
          first_attempt_at: Date;
        }>(sql`select * from public.claim_owner_emails(1,${delivery.id}::uuid)`)
      ).rows;
    const record = async (
      token: string,
      outcome: string,
      provider: string | null,
      reason: string | null,
      delay: number | null,
    ) =>
      (
        await tx.execute<{ recorded: boolean }>(
          sql`select public.record_owner_email(${delivery.id}::uuid,${token}::uuid,${outcome},${provider}::uuid,${reason},${delay}::integer) as recorded`,
        )
      ).rows[0].recorded;

    const [first] = await claim();
    assert.equal(first.recipient, email);
    assert.equal(
      (await claim()).length,
      0,
      'active lease excludes duplicate claims',
    );
    assert.equal(
      await record(
        crypto.randomUUID(),
        'accepted',
        crypto.randomUUID(),
        null,
        0,
      ),
      false,
      'forged lease fenced',
    );
    // Savepoint keeps an invalid argument probe from aborting the outer rollback fixture.
    const invalid = await tx
      .transaction(async (savepoint) => {
        return (
          await savepoint.execute<{ recorded: boolean }>(
            sql`select public.record_owner_email(${delivery.id}::uuid,${first.lease_token}::uuid,'retry',NULL,'provider-unavailable',NULL) as recorded`,
          )
        ).rows[0].recorded;
      })
      .catch(() => 'invalid-argument-threw');
    assert.equal(
      invalid,
      false,
      'NULL retry delay must be rejected without changing the delivery',
    );
    assert.equal(
      await record(
        first.lease_token,
        'retry',
        null,
        'provider-unavailable',
        60,
      ),
      true,
    );
    assert.equal(
      (await claim()).length,
      0,
      'backoff prevents immediate reclaim',
    );

    await tx.execute(
      sql`update public.response_email_delivery set available_at=now()-interval '1 second' where id=${delivery.id}::uuid`,
    );

    const [second] = await claim();
    assert.equal(
      second.id,
      first.id,
      'retries preserve the idempotency identity',
    );
    assert.equal(
      new Date(second.first_attempt_at).getTime(),
      new Date(first.first_attempt_at).getTime(),
    );
    assert.notEqual(second.lease_token, first.lease_token);
    assert.equal(
      await record(first.lease_token, 'accepted', crypto.randomUUID(), null, 0),
      false,
      'stale writer fenced',
    );

    await tx.execute(
      sql`update public.response_email_delivery set lease_until=now()-interval '1 second' where id=${delivery.id}::uuid`,
    );

    const [third] = await claim();
    assert.notEqual(
      third.lease_token,
      second.lease_token,
      'expired worker claim can be recovered',
    );
    const provider = crypto.randomUUID();
    assert.equal(
      await record(third.lease_token, 'accepted', provider, null, 0),
      true,
    );
    assert.equal(
      await record(third.lease_token, 'accepted', provider, null, 0),
      false,
      'completion cannot be replayed',
    );
    assert.equal((await claim()).length, 0, 'accepted email is not resent');
    await assert.rejects(
      retryOwnerEmail(tx, actor, workspace.id, formId, {
        deliveryId: delivery.id,
        expectedAttempts: 3,
      }),
      /EMAIL_RETRY_CONFLICT/,
    );
    const receipt = async (
      incoming: string | null,
      provided = provider,
      to = email,
    ) =>
      (
        await tx.execute<{ recorded: boolean }>(
          sql`select public.record_owner_provider_status(${delivery.id}::uuid,${provided}::uuid,${to},${incoming}) as recorded`,
        )
      ).rows[0].recorded;
    assert.equal(await receipt(null), false, 'NULL provider state rejected');
    assert.equal(
      await receipt('delivered', provider, 'other@example.invalid'),
      false,
      'recipient mismatch rejected',
    );
    assert.equal(await receipt('delivered'), true);
    assert.equal(
      await receipt('delivered'),
      false,
      'provider replay is idempotent',
    );
    assert.equal(
      await receipt('accepted'),
      false,
      'late acceptance cannot downgrade delivery',
    );
    assert.equal(
      await receipt('complained', crypto.randomUUID()),
      false,
      'provider identity mismatch rejected',
    );
    assert.equal(await receipt('complained'), true);
    assert.equal(
      await receipt('bounced'),
      false,
      'late events cannot downgrade a complaint',
    );

    // Only this transaction's synthetic delivery is modified for repair probes.
    await tx.execute(
      sql`update public.response_email_delivery set status='needs_action',reason='configuration',provider_id=NULL,accepted_at=NULL where id=${delivery.id}::uuid`,
    );
    const repair = (
      expectedAttempts = 3,
      requestedForm = formId,
      requestedActor = actor,
    ) =>
      retryOwnerEmail(tx, requestedActor, workspace.id, requestedForm, {
        deliveryId: delivery.id,
        expectedAttempts,
      });
    const viewer = crypto.randomUUID();
    await tx.insert(user).values({
      id: viewer,
      name: 'Repair viewer QA',
      email: `${viewer}@example.invalid`,
      emailVerified: true,
    });
    await tx
      .insert(membership)
      .values({ workspaceId: workspace.id, userId: viewer, role: 'viewer' });
    await inWorkspace(
      tx,
      viewer,
      workspace.id,
      'responses.read',
      async (scoped) => {
        await scoped.execute(
          sql`select set_config('snapform.role','owner',true)`,
        );
        assert.deepEqual(
          (
            await scoped.execute(
              sql`select public.can_retry_owner_email(${delivery.id}::uuid) as eligible,public.retry_owner_email(${workspace.id}::uuid,${formId}::uuid,${delivery.id}::uuid,3) as queued`,
            )
          ).rows,
          [{ eligible: false, queued: false }],
          'forged role context cannot replace actual membership',
        );
      },
    );
    await assert.rejects(
      repair(2),
      /EMAIL_RETRY_CONFLICT/,
      'stale attempt count is rejected',
    );
    await assert.rejects(
      repair(3, crypto.randomUUID()),
      /EMAIL_RETRY_CONFLICT/,
      'form boundary is enforced',
    );
    await assert.rejects(
      repair(3, formId, crypto.randomUUID()),
      /WORKSPACE_NOT_FOUND/,
      'foreign actor is denied',
    );
    const original = (
      await tx.execute(
        sql`select id,recipient_email,first_attempt_at,attempts from public.response_email_delivery where id=${delivery.id}::uuid`,
      )
    ).rows;
    await tx.execute(
      sql`update public.response_email_delivery set first_attempt_at=now()-interval '24 hours' where id=${delivery.id}::uuid`,
    );
    await assert.rejects(
      repair(),
      /EMAIL_RETRY_CONFLICT/,
      'expired idempotency window is not restarted',
    );
    await tx.execute(
      sql`update public.response_email_delivery set first_attempt_at=${first.first_attempt_at}::timestamptz where id=${delivery.id}::uuid`,
    );
    await tx.execute(
      sql`update public."user" set email_verified=false where id=${actor}`,
    );
    await assert.rejects(
      repair(),
      /EMAIL_RETRY_CONFLICT/,
      'recipient must still be verified',
    );
    await tx.execute(
      sql`update public."user" set email_verified=true where id=${actor}`,
    );
    await repair();
    assert.deepEqual(
      (
        await tx.execute(
          sql`select id,recipient_email,first_attempt_at,attempts from public.response_email_delivery where id=${delivery.id}::uuid`,
        )
      ).rows,
      original,
      'repair preserves payload, identity and retry window',
    );
    await assert.rejects(
      repair(),
      /EMAIL_RETRY_CONFLICT/,
      'duplicate repair cannot queue twice',
    );
    const [repaired] = await claim();
    assert.equal(repaired.id, delivery.id);
    assert.equal(
      new Date(repaired.first_attempt_at).getTime(),
      new Date(first.first_attempt_at).getTime(),
    );
    assert.equal(
      await record(
        repaired.lease_token,
        'accepted',
        crypto.randomUUID(),
        null,
        0,
      ),
      true,
    );
    await assert.rejects(
      repair(4),
      /EMAIL_RETRY_CONFLICT/,
      'accepted repair is not resent',
    );

    for (const [attempts, age, reason] of [
      [8, '1 hour', 'attempts-exhausted'],
      [1, '24 hours', 'idempotency-expired'],
    ] as const) {
      await tx.execute(
        sql`update public.response_email_delivery set status='pending',reason=NULL,attempts=${attempts},first_attempt_at=now()-${age}::interval,available_at=now()-interval '1 second',provider_id=NULL,accepted_at=NULL where id=${delivery.id}::uuid`,
      );
      assert.equal((await claim()).length, 0);

      assert.deepEqual(
        (
          await tx.execute(
            sql`select status,reason from public.response_email_delivery where id=${delivery.id}::uuid`,
          )
        ).rows,
        [{ status: 'needs_action', reason }],
      );
      await assert.rejects(
        repair(Math.min(attempts, 7)),
        /EMAIL_RETRY_CONFLICT/,
        'exhausted/expired work cannot be repaired',
      );
    }
    await tx.execute(
      sql`update public.response_email_delivery set status='pending',reason=NULL,attempts=0,first_attempt_at=NULL where id=${delivery.id}::uuid`,
    );
    await tx.execute(
      sql`update public."user" set email_verified=false where id=${actor}`,
    );
    assert.equal((await claim()).length, 0);

    assert.deepEqual(
      (
        await tx.execute(
          sql`select status,reason from public.response_email_delivery where id=${delivery.id}::uuid`,
        )
      ).rows,
      [{ status: 'needs_action', reason: 'recipient-unavailable' }],
    );
    await configureEmailNotifications(tx, actor, workspace.id, formId, {
      enabled: false,
      expectedRevision: 1,
    });
    assert.deepEqual(
      (
        await tx.execute(
          sql`select status,reason from public.response_email_delivery where id=${delivery.id}::uuid`,
        )
      ).rows,
      [{ status: 'cancelled', reason: 'disabled' }],
    );
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) {
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : 'Email delivery verification failed (transaction rolled back).',
    );
    process.exitCode = 1;
  } else
    console.log(
      'Email claims, fencing, expiry, backoff, recipient checks and cancellation passed; all synthetic writes rolled back.',
    );
} finally {
  await close();
}
