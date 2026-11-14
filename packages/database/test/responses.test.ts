import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { listResponses, getResponse } from '../src/responses.ts';
import { getResponseExport } from '../src/response-export.ts';
import { scheduleDeletion } from '../src/deletion.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
import { compileDefinition } from '../../contracts/src/compile.ts';
import { prepareIntakeProgress } from '../../contracts/src/intake-progress.ts';
import type { Answer } from '../../contracts/src/answers.ts';
import { seedResponses } from './fixtures/forms.ts';

type Fixture = {
  tx: Transaction;
  actor: string;
  workspaceId: string;
  formId: string;
  definition: ReturnType<typeof formFixture>['definition'];
  ids: string[];
  partial: string;
  publicId: string;
  budgetId: string;
};
// Submits one more synthetic response through the respondent functions,
// inside the caller's rollback transaction.
async function submitResponse(
  tx: Transaction,
  definition: Fixture['definition'],
  publicId: string,
  answers: Record<string, Answer>,
) {
  const compiled = compileDefinition(definition);
  if (!compiled.ok) throw Error('Valid response fixture required');
  const prepared = prepareIntakeProgress(compiled.definition, answers, true);
  if (!prepared.ok) throw Error('Complete response fixture required');
  const id = crypto.randomUUID(),
    hash = id.replaceAll('-', '').repeat(2);
  await tx.execute(
    sql`select set_config('snapform.user_id','',true),set_config('snapform.workspace_id','',true),set_config('snapform.role','',true),set_config('snapform.public_id',${publicId},true),set_config('snapform.intake_id',${id},true),set_config('snapform.intake_hash',${hash},true)`,
  );
  const started = await tx.execute<{ id: string | null }>(
    sql`select public.start_response_session(${publicId}::uuid,${id}::uuid,${hash}) as id`,
  );
  expect(started.rows).toEqual([{ id }]);
  const submitted = await tx.execute<{ outcome: string }>(
    sql`select result.outcome from public.mutate_response_session(${id}::uuid,${crypto.randomUUID()}::uuid,1,'submit',${JSON.stringify(answers)}::jsonb,${JSON.stringify(prepared.answers)}::jsonb,${prepared.endingId}::uuid) result`,
  );
  expect(submitted.rows).toEqual([{ outcome: 'ok' }]);
  return id;
}
async function withResponses(run: (fixture: Fixture) => Promise<void>) {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback response reader fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const fixture = await seedResponses(tx);
        await run({ tx, ...fixture });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}

it(
  'reads finalized responses with original questions, answer states and stable cursors',
  () =>
    withResponses(
      async ({
        tx,
        actor,
        workspaceId,
        formId,
        definition,
        ids,
        partial,
        budgetId,
      }) => {
        const page = await listResponses(tx, actor, workspaceId, formId);
        expect(page.responses.map((row) => row.id)).toEqual(ids);
        expect(page.nextCursor).toBeNull();
        expect(page.responses[0]).toMatchObject({ version: 1 });
        expect(Object.keys(page.responses[0]).sort()).toEqual([
          'deletionPending',
          'id',
          'preview',
          'respondent',
          'submittedAt',
          'version',
          'versionId',
        ]);
        expect(page.responses[0]).toMatchObject({
          deletionPending: false,
          respondent: 'qa@example.invalid',
          preview: null,
        });
        expect(page.title).toBe('Changed draft title');
        expect(page.versions).toEqual([
          { id: page.responses[0].versionId, number: 1 },
        ]);
        const detail = await getResponse(
          tx,
          actor,
          workspaceId,
          formId,
          ids[0],
        );
        expect(detail.definition.title).toBe(definition.title);
        expect(detail.answers[budgetId]).toEqual({ state: 'value', value: 0 });
        expect(Object.keys(detail)).not.toContain('capabilityHash');
        const time = (
          await tx.execute<{ time: string }>(
            sql`select to_char(submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as time from response_session where id=${ids[0]}::uuid`,
          )
        ).rows[0].time;
        const older = await listResponses(tx, actor, workspaceId, formId, {
          createdAt: time,
          id: ids[0],
        });
        expect(older.responses.map((row) => row.id)).toEqual([ids[1]]);
        await expect(
          getResponse(tx, actor, workspaceId, formId, partial),
        ).rejects.toThrow('RESPONSE_NOT_FOUND');
      },
    ),
  30000,
);

it(
  'summarizes long answers server-side without returning answer payloads',
  () =>
    withResponses(
      async ({ tx, actor, workspaceId, formId, definition, publicId }) => {
        const fields = definition.pages.flatMap((page) => page.blocks);
        const detail = fields.find((block) => block.type === 'long-text'),
          email = fields.find((block) => block.type === 'email'),
          budget = fields.find((block) => block.type === 'number');
        if (!detail || !email || !budget) throw Error('Fixtures required');
        const story = `  Need a\nnew site ${'y'.repeat(9000)}`;
        const id = await submitResponse(tx, definition, publicId, {
          [budget.id]: { state: 'value', value: 5 },
          [detail.id]: { state: 'value', value: story },
          [email.id]: { state: 'value', value: 'lead@example.invalid' },
        });
        const page = await listResponses(tx, actor, workspaceId, formId);
        // Rows share the transaction timestamp, so find this one by identity.
        expect(page.responses.find((row) => row.id === id)).toMatchObject({
          respondent: 'lead@example.invalid',
          preview: `Need a new site ${'y'.repeat(103)}…`,
        });
        expect(JSON.stringify(page)).not.toContain('y'.repeat(300));
      },
    ),
  30000,
);

it(
  'enforces tenant and viewer boundaries without exposing capabilities',
  () =>
    withResponses(async ({ tx, actor, workspaceId, formId, ids }) => {
      await expect(
        listResponses(tx, crypto.randomUUID(), workspaceId, formId),
      ).rejects.toThrow('WORKSPACE_NOT_FOUND');
      await expect(
        getResponse(tx, actor, workspaceId, crypto.randomUUID(), ids[0]),
      ).rejects.toThrow('RESPONSE_NOT_FOUND');
      const viewer = crypto.randomUUID();
      await tx.insert(user).values({
        id: viewer,
        name: 'Response viewer QA',
        email: `${viewer}@example.invalid`,
        emailVerified: true,
      });
      await listResponses(tx, actor, workspaceId, formId);
      await tx.insert(membership).values({
        workspaceId: workspaceId,
        userId: viewer,
        role: 'viewer',
      });
      expect((await listResponses(tx, viewer, workspaceId, formId)).role).toBe(
        'viewer',
      );
      expect(
        (await getResponse(tx, viewer, workspaceId, formId, ids[0])).id,
      ).toBe(ids[0]);
      await tx.execute(
        sql`select set_config('snapform.user_id',${crypto.randomUUID()},true),set_config('snapform.role','owner',true),set_config('snapform.intake_hash','',true)`,
      );
      expect(
        (
          await tx.execute(
            sql`select id from response_session where form_id=${formId}::uuid`,
          )
        ).rows,
      ).toEqual([]);
    }),
  30000,
);

it(
  'never exports a response that is scheduled for deletion',
  () =>
    withResponses(async ({ tx, actor, workspaceId, formId, ids }) => {
      const [removed, kept] = ids;
      const { versionId } = await getResponse(
        tx,
        actor,
        workspaceId,
        formId,
        kept,
      );
      const editor = crypto.randomUUID();
      await tx.insert(user).values({
        id: editor,
        name: 'Response editor QA',
        email: `${editor}@example.invalid`,
        emailVerified: true,
      });
      await tx
        .insert(membership)
        .values({ workspaceId, userId: editor, role: 'editor' });
      await scheduleDeletion(
        tx,
        actor,
        workspaceId,
        { kind: 'response', targetId: removed },
        {
          requestId: crypto.randomUUID(),
          confirmation: 'DELETE',
          acknowledgeDeletion: true,
        },
      );
      for (const member of [actor, editor]) {
        const exported = await getResponseExport(
          tx,
          member,
          workspaceId,
          formId,
          versionId,
        );
        expect(exported.rows.map((row) => row.id)).toEqual([kept]);
      }
      // The inbox keeps the response so the owner can cancel, and marks it.
      const page = await listResponses(tx, editor, workspaceId, formId);
      expect(
        page.responses.map(({ id, deletionPending }) => ({
          id,
          deletionPending,
        })),
      ).toEqual([
        { id: removed, deletionPending: true },
        { id: kept, deletionPending: false },
      ]);
    }),
  30000,
);

it('answers deletion checks only for members of the scoped workspace', () =>
  withResponses(async ({ tx, actor, workspaceId, ids }) => {
    const check = (workspace: string, response: string | null) =>
      tx.execute<{ pending: boolean }>(
        sql`select public.response_deletion_pending(${workspace}::uuid,${response}::uuid) as pending`,
      );
    // The same transaction settings scope_workspace leaves for a member.
    await tx.execute(
      sql`select set_config('snapform.user_id',${actor},true),set_config('snapform.workspace_id',${workspaceId},true)`,
    );
    expect((await check(workspaceId, ids[0])).rows).toEqual([
      { pending: false },
    ]);
    // Any other caller is told "pending", so NOT filters return nothing.
    expect((await check(crypto.randomUUID(), ids[0])).rows).toEqual([
      { pending: true },
    ]);
    await tx.execute(
      sql`select set_config('snapform.user_id',${crypto.randomUUID()},true)`,
    );
    expect((await check(workspaceId, ids[0])).rows).toEqual([
      { pending: true },
    ]);
    await tx.execute(
      sql`select set_config('snapform.user_id',${actor},true),set_config('snapform.workspace_id','',true)`,
    );
    expect((await check(workspaceId, ids[0])).rows).toEqual([
      { pending: true },
    ]);
    expect(
      (
        await tx.execute(sql`select
          has_function_privilege('snapform_runtime','public.response_deletion_pending(uuid,uuid)','EXECUTE') as runtime,
          has_function_privilege('snapform_jobs','public.response_deletion_pending(uuid,uuid)','EXECUTE') as jobs,
          has_function_privilege('snapform_runtime','public.pending_target_deletion(uuid,uuid)','EXECUTE') as runtime_target,
          exists(select 1 from aclexplode(p.proacl) a where a.grantee = 0) as anyone,
          p.prosecdef as definer,p.provolatile as volatility,p.proconfig as config
          from pg_proc p where p.oid='public.response_deletion_pending(uuid,uuid)'::regprocedure`)
      ).rows,
    ).toEqual([
      {
        runtime: true,
        jobs: false,
        runtime_target: false,
        anyone: false,
        definer: true,
        volatility: 's',
        config: ['search_path=pg_catalog'],
      },
    ]);
  }));

it(
  'exports the pinned version and rejects unknown versions and viewer exports',
  () =>
    withResponses(
      async ({ tx, actor, workspaceId, formId, definition, ids }) => {
        const detail = await getResponse(
          tx,
          actor,
          workspaceId,
          formId,
          ids[0],
        );
        const exported = await getResponseExport(
          tx,
          actor,
          workspaceId,
          formId,
          detail.versionId,
        );
        expect(exported.rows.map((row) => row.id)).toEqual(ids);
        expect(exported.definition.title).toBe(definition.title);
        expect(exported.version).toBe(1);
        await expect(
          getResponseExport(
            tx,
            actor,
            workspaceId,
            formId,
            crypto.randomUUID(),
          ),
        ).rejects.toThrow('VERSION_NOT_FOUND');
        const viewer = crypto.randomUUID();
        await tx.insert(user).values({
          id: viewer,
          name: 'Response viewer QA',
          email: `${viewer}@example.invalid`,
          emailVerified: true,
        });
        await listResponses(tx, actor, workspaceId, formId);
        await tx.insert(membership).values({
          workspaceId: workspaceId,
          userId: viewer,
          role: 'viewer',
        });
        await expect(
          getResponseExport(tx, viewer, workspaceId, formId, detail.versionId),
        ).rejects.toThrow('FORBIDDEN');
      },
    ),
  30000,
);
