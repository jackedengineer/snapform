import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake } from '../src/intake.ts';
import { scheduleDeletion, cancelDeletion } from '../src/deletion.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
if (!process.env.DATABASE_MIGRATION_URL)
  throw Error('Private operator configuration required');
const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL);
const actor = crypto.randomUUID(),
  workspaceId = crypto.randomUUID(),
  rollback = Error('Rollback owner purge fixtures');
let stage = 'setup';
try {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: actor,
        name: 'Owner purge QA',
        email: `${actor}@example.invalid`,
        emailVerified: true,
      });
      await createWorkspace(tx, actor, {
        id: workspaceId,
        name: 'Owner purge QA',
        segment: 'agency',
      });
      const formId = crypto.randomUUID();
      await createForm(tx, actor, workspaceId, {
        id: formId,
        definition: formFixture().definition,
      });
      const publication = await publishForm(tx, actor, workspaceId, formId, {
        versionId: crypto.randomUUID(),
        expectedRevision: 1,
      });
      const publicId = publication.publication?.publicId;
      if (!publicId) throw Error('Missing fixture publication');
      const responseId = crypto.randomUUID(),
        retainedId = crypto.randomUUID();
      await startIntake(tx, publicId, responseId, 'a'.repeat(64));
      await startIntake(tx, publicId, retainedId, 'b'.repeat(64));
      await tx.execute(
        sql`insert into public.trial_response_usage(owner_id,responses_used) values(${actor},2) on conflict(owner_id) do update set responses_used=2`,
      );
      const request = await scheduleDeletion(
        tx,
        actor,
        workspaceId,
        { kind: 'response', targetId: responseId },
        {
          requestId: crypto.randomUUID(),
          confirmation: 'DELETE',
          acknowledgeDeletion: true,
        },
      );
      stage = 'claim';
      for (const limit of [null, 0, 21, 20])
        assert.deepEqual(
          (
            await tx.execute(
              sql`select * from public.claim_owner_deletions(${limit}::integer,${workspaceId}::uuid)`,
            )
          ).rows,
          [],
        );
      await tx.execute(
        sql`update public.deletion_request set requested_at=now()-interval '25 hours',not_before=now()-interval '1 hour' where id=${request.id}::uuid`,
      );
      const first = (
        await tx.execute(
          sql`select * from public.claim_owner_deletions(20,${workspaceId}::uuid)`,
        )
      ).rows;
      assert.equal(first.length, 1);
      assert.equal(first[0]?.kind, 'response');
      assert.equal(first[0]?.reason, 'owner');
      assert.equal(first[0]?.target_id, responseId);
      assert.deepEqual(
        (
          await tx.execute(
            sql`select * from public.claim_owner_deletions(20,${workspaceId}::uuid)`,
          )
        ).rows,
        first,
      );
      await assert.rejects(
        cancelDeletion(tx, actor, workspaceId, request.id, {
          expectedRevision: 1,
        }),
        /DELETION_CONFLICT/,
      );
      assert.equal(
        (
          await tx.execute(
            sql`select count(*)::integer as count from public.response_session where workspace_id=${workspaceId}::uuid`,
          )
        ).rows[0]?.count,
        2,
      );
      assert.deepEqual(
        (
          await tx.execute(
            sql`select public.finalize_response_purge(${first[0]?.id}::uuid) as done`,
          )
        ).rows,
        [{ done: true }],
      );
      assert.equal(
        (
          await tx.execute(
            sql`select count(*)::integer as count from public.response_session where workspace_id=${workspaceId}::uuid`,
          )
        ).rows[0]?.count,
        1,
      );
      stage = 'workspace';
      const entire = await scheduleDeletion(
        tx,
        actor,
        workspaceId,
        { kind: 'workspace', targetId: workspaceId },
        {
          requestId: crypto.randomUUID(),
          confirmation: 'Owner purge QA',
          acknowledgeDeletion: true,
        },
      );
      assert.deepEqual(
        (
          await tx.execute(
            sql`select * from public.claim_owner_deletions(20,${workspaceId}::uuid)`,
          )
        ).rows,
        [],
      );
      await tx.execute(
        sql`update public.deletion_request set requested_at=now()-interval '25 hours',not_before=now()-interval '1 hour' where id=${entire.id}::uuid`,
      );
      const claimed = (
        await tx.execute(
          sql`select * from public.claim_owner_deletions(20,${workspaceId}::uuid)`,
        )
      ).rows;
      assert.equal(claimed.length, 1);
      assert.equal(claimed[0]?.kind, 'workspace');
      // Calling finalization here simulates a prior durable ledger acknowledgement.
      stage = 'finalize';
      for (let repeat = 0; repeat < 2; repeat++)
        assert.deepEqual(
          (
            await tx.execute(
              sql`select public.finalize_workspace_purge(${claimed[0]?.id}::uuid) as done`,
            )
          ).rows,
          [{ done: true }],
        );
      assert.deepEqual(
        (
          await tx.execute(
            sql`select id from public.workspace where id=${workspaceId}::uuid`,
          )
        ).rows,
        [],
      );
      assert.deepEqual(
        (
          await tx.execute(
            sql`select id from public.response_session where workspace_id=${workspaceId}::uuid`,
          )
        ).rows,
        [],
      );
      assert.equal(
        (
          await tx.execute(
            sql`select responses_used from public.trial_response_usage where owner_id=${actor}`,
          )
        ).rows[0]?.responses_used,
        2,
      );
      assert.equal(
        (
          await tx.execute(
            sql`select count(*)::integer as count from public.purge_intent where workspace_id=${workspaceId}::uuid and completed_at is not null`,
          )
        ).rows[0]?.count,
        2,
      );
      await assert.rejects(
        tx.transaction(async (nested) => {
          await nested.execute(
            sql`insert into public.workspace(id,name,segment,created_by) values(${workspaceId}::uuid,'Reuse QA','agency',${actor})`,
          );
        }),
        (error) =>
          error instanceof Error &&
          error.cause instanceof Error &&
          error.cause.message === 'PURGE_INTENT_EXISTS',
      );
      assert.deepEqual(
        (
          await tx.execute(
            sql`select has_function_privilege('snapform_runtime','public.claim_owner_deletions(integer,uuid)','EXECUTE') as runtime_claim,has_function_privilege('snapform_runtime','public.finalize_workspace_purge(uuid)','EXECUTE') as runtime_purge,has_function_privilege('snapform_jobs','public.claim_owner_deletions(integer,uuid)','EXECUTE') as jobs_claim`,
          )
        ).rows,
        [{ runtime_claim: false, runtime_purge: false, jobs_claim: true }],
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.deepEqual(
    (await db.execute(sql`select id from public."user" where id=${actor}`))
      .rows,
    [],
  );
  console.log(
    JSON.stringify({ event: 'owner_purge_verified', rolledBack: true }),
  );
} catch (error) {
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String(cause.code)
      : undefined;
  const position =
    cause && typeof cause === 'object' && 'position' in cause
      ? Number(cause.position)
      : undefined;
  console.error(
    JSON.stringify({
      event: 'owner_purge_verification_failed',
      stage,
      code,
      position,
    }),
  );
  process.exitCode = 1;
} finally {
  await close();
}
