import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { saveWebhookConfiguration } from '../src/webhook-settings.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
import { claimExpiredResponses, finalizeResponsePurge } from '../src/purge.ts';
if (!process.env.DATABASE_MIGRATION_URL)
  throw Error('Private operator configuration required');
const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL);
const rollback = Error('Expected purge fixture rollback'),
  actor = crypto.randomUUID(),
  workspaceId = crypto.randomUUID();
let stage = 'setup',
  verified = false;
const startedAt = Date.now();
try {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: actor,
        name: 'Purge QA',
        email: `${actor}@example.invalid`,
        emailVerified: true,
      });
      await createWorkspace(tx, actor, {
        id: workspaceId,
        name: 'Purge QA',
        segment: 'agency',
      });
      const { definition, ids } = formFixture(),
        formId = crypto.randomUUID(),
        configId = crypto.randomUUID();
      await createForm(tx, actor, workspaceId, { id: formId, definition });
      const publication = await publishForm(tx, actor, workspaceId, formId, {
        versionId: crypto.randomUUID(),
        expectedRevision: 1,
      });
      await saveWebhookConfiguration(
        tx,
        actor,
        workspaceId,
        formId,
        {
          configurationId: configId,
          expectedRevision: 0,
          url: 'https://hooks.example.com/rollback-only',
        },
        btoa('s'.repeat(32)),
      );
      await tx.execute(
        sql`update public.webhook_configuration set verified_at=now() where id=${configId}::uuid`,
      );
      await tx.execute(
        sql`update public.form_webhook_settings set enabled=true where configuration_id=${configId}::uuid`,
      );
      await tx.execute(
        sql`insert into public.form_email_settings(workspace_id,form_id,enabled,updated_by) values(${workspaceId}::uuid,${formId}::uuid,true,${actor})`,
      );
      const sessions = [
        { id: crypto.randomUUID(), age: 8, submitted: false, expired: true },
        { id: crypto.randomUUID(), age: 1, submitted: false, expired: false },
        { id: crypto.randomUUID(), age: 91, submitted: true, expired: true },
        { id: crypto.randomUUID(), age: 90, submitted: true, expired: true },
        { id: crypto.randomUUID(), age: 89, submitted: true, expired: false },
      ];
      for (const item of sessions) {
        await tx.execute(sql`insert into public.response_session(id,workspace_id,form_id,version_id,capability_hash,created_at,expires_at,reservation_until,status,submitted_at,ending_id,answers)
          values(${item.id}::uuid,${workspaceId}::uuid,${formId}::uuid,${publication.versionId}::uuid,${item.id.replaceAll('-', '').repeat(2)},now()-(${item.age + 1}*interval '24 hours'),now()-(${item.age - 6}*interval '24 hours'),now()-(${item.age - 6}*interval '24 hours'),${item.submitted ? 'submitted' : 'collecting'},${item.submitted ? sql`now()-(${item.age}*interval '24 hours')` : sql`null`},${item.submitted ? ids.ending : null}::uuid,'{}'::jsonb)`);
        if (item.submitted)
          await tx.execute(
            sql`insert into public.response_outbox(session_id,workspace_id,form_id,version_id) values(${item.id}::uuid,${workspaceId}::uuid,${formId}::uuid,${publication.versionId}::uuid)`,
          );
      }
      await tx.execute(
        sql`insert into public.trial_response_usage(owner_id,responses_used) values(${actor},3)`,
      );
      await tx.execute(
        sql`insert into public.intake_operation(session_id,id,kind,payload_hash,base_revision,result_revision) values(${sessions[0].id}::uuid,${crypto.randomUUID()}::uuid,'save',${'a'.repeat(64)},1,2)`,
      );
      stage = 'claim';
      for (const limit of [0, 21, null])
        assert.deepEqual(
          (
            await tx.execute(
              sql`select * from public.claim_expired_responses(${limit}::integer,${workspaceId}::uuid)`,
            )
          ).rows,
          [],
        );
      const first = await claimExpiredResponses(tx, workspaceId);
      assert.equal(first.length, 3);
      assert.deepEqual(
        first.map((x) => x.targetId).sort(),
        sessions
          .filter((x) => x.expired)
          .map((x) => x.id)
          .sort(),
      );
      assert(
        first.every(
          (x) =>
            x.kind === 'response' &&
            x.reason === 'expired' &&
            x.workspaceId === workspaceId,
        ),
      );
      assert.deepEqual(await claimExpiredResponses(tx, workspaceId), first);
      assert.equal(
        (
          await tx.execute(
            sql`select id from public.response_session where workspace_id=${workspaceId}::uuid`,
          )
        ).rows.length,
        5,
      );
      const cancelled = await tx.execute(
        sql`select status,reason from public.webhook_delivery where session_id=${sessions[2].id}::uuid union all select status,reason from public.response_email_delivery where session_id=${sessions[2].id}::uuid`,
      );
      assert.deepEqual(cancelled.rows, [
        { status: 'cancelled', reason: 'disabled' },
        { status: 'cancelled', reason: 'disabled' },
      ]);
      // Once claimed, extending retention cannot revive this irreversible intent.
      await tx.execute(
        sql`insert into public.workspace_retention(workspace_id,days,updated_by) values(${workspaceId}::uuid,365,${actor})`,
      );
      stage = 'finalize';
      for (const item of first) {
        assert.equal(await finalizeResponsePurge(tx, item), true);
        assert.equal(await finalizeResponsePurge(tx, item), true);
      }
      assert.equal(
        await finalizeResponsePurge(tx, {
          ...first[0],
          id: crypto.randomUUID(),
        }),
        false,
      );
      assert.deepEqual(
        (
          await tx.execute(
            sql`select id from public.response_session where workspace_id=${workspaceId}::uuid order by id`,
          )
        ).rows.map((x) => x.id),
        sessions
          .filter((x) => !x.expired)
          .map((x) => x.id)
          .sort(),
      );
      for (const table of [
        'response_outbox',
        'response_email_delivery',
        'webhook_delivery',
      ]) {
        assert.equal(
          (
            await tx.execute(
              sql`select count(*)::int as count from ${sql.identifier(table)} where workspace_id=${workspaceId}::uuid`,
            )
          ).rows[0].count,
          1,
        );
      }
      assert.equal(
        (
          await tx.execute(
            sql`select count(*)::int as count from public.intake_operation where session_id=${sessions[0].id}::uuid`,
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (
          await tx.execute(
            sql`select responses_used from public.trial_response_usage where owner_id=${actor}`,
          )
        ).rows[0].responses_used,
        3,
      );
      assert.equal(
        (
          await tx.execute(
            sql`select count(*)::int as count from public.purge_intent where workspace_id=${workspaceId}::uuid and completed_at is not null`,
          )
        ).rows[0].count,
        3,
      );
      assert.deepEqual(await claimExpiredResponses(tx, workspaceId), []);
      stage = 'reuse';
      await assert.rejects(
        tx.transaction(async (nested) => {
          await nested.execute(
            sql`insert into public.response_session(id,workspace_id,form_id,version_id,capability_hash,expires_at) values(${sessions[0].id}::uuid,${workspaceId}::uuid,${formId}::uuid,${publication.versionId}::uuid,${'b'.repeat(64)},now()+interval '7 days')`,
          );
        }),
        (error: unknown) =>
          error instanceof Error &&
          error.cause instanceof Error &&
          error.cause.message === 'PURGE_INTENT_EXISTS',
      );
      // A shorter policy expires remaining submitted content, not recent drafts.
      await tx.execute(
        sql`update public.workspace_retention set days=30 where workspace_id=${workspaceId}::uuid`,
      );
      const shortened = await claimExpiredResponses(tx, workspaceId);
      assert.deepEqual(
        shortened.map((item) => item.targetId),
        [sessions[4].id],
      );
      assert.equal(await finalizeResponsePurge(tx, shortened[0]), true);
      assert.equal(
        (
          await tx.execute(
            sql`select responses_used from public.trial_response_usage where owner_id=${actor}`,
          )
        ).rows[0].responses_used,
        3,
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  stage = 'rollback';
  assert.equal(
    (await db.execute(sql`select id from public."user" where id=${actor}`)).rows
      .length,
    0,
  );
  assert.equal(
    (
      await db.execute(
        sql`select id from public.purge_intent where workspace_id=${workspaceId}::uuid`,
      )
    ).rows.length,
    0,
  );
  stage = 'jobs-identity';
  const config = parseEnv(
    await readFile(
      new URL('../../../apps/jobs/.dev.vars', import.meta.url),
      'utf8',
    ),
  );
  const jobs = await openDatabase(config.DATABASE_URL);
  try {
    assert.equal(
      (await jobs.db.execute(sql`select current_user as identity`)).rows[0]
        .identity,
      'snapform_jobs',
    );
    await jobs.db.transaction(async (tx) => {
      assert.deepEqual(await claimExpiredResponses(tx, workspaceId), []);
      assert.equal(
        await finalizeResponsePurge(tx, {
          id: crypto.randomUUID(),
          workspaceId,
          kind: 'response',
          targetId: crypto.randomUUID(),
          reason: 'expired',
          createdAt: new Date().toISOString(),
        }),
        false,
      );
    });
  } finally {
    await jobs.close();
  }
  verified = true;
  console.log(
    JSON.stringify({
      event: 'response_purge_verified',
      fixturesRolledBack: true,
      externalRequests: 0,
      elapsedMs: Date.now() - startedAt,
    }),
  );
} catch {
  console.error(
    JSON.stringify({ event: 'response_purge_verification_failed', stage }),
  );
  process.exitCode = 1;
} finally {
  await close();
}
if (!verified) process.exitCode = 1;
