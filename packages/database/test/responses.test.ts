import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm, saveDraft } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake, mutateIntake } from '../src/intake.ts';
import { listResponses, getResponse } from '../src/responses.ts';
import { getResponseExport } from '../src/response-export.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';

type Fixture = {
  tx: Transaction;
  actor: string;
  workspaceId: string;
  formId: string;
  definition: ReturnType<typeof formFixture>['definition'];
  ids: string[];
  partial: string;
  budgetId: string;
};
async function withResponses(run: (fixture: Fixture) => Promise<void>) {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback response reader fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID(),
          formId = crypto.randomUUID();
        await tx.insert(user).values({
          id: actor,
          name: 'Response QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Response QA',
          segment: 'agency',
        });
        const definition = formFixture().definition;
        await createForm(tx, actor, workspace.id, { id: formId, definition });
        const published = await publishForm(tx, actor, workspace.id, formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        });
        if (!published.publication) throw Error('Publication required');
        const publicId = published.publication.publicId;
        const fields = definition.pages.flatMap((page) => page.blocks);
        const budget = fields.find((field) => field.type === 'number'),
          email = fields.find((field) => field.type === 'email');
        if (!budget || !email) throw Error('Fixture fields required');
        const ids = [crypto.randomUUID(), crypto.randomUUID()].sort().reverse();
        for (const id of ids) {
          const hash = id.replaceAll('-', '').repeat(2);
          await startIntake(tx, publicId, id, hash);
          await mutateIntake(tx, publicId, id, hash, 'submit', {
            operationId: crypto.randomUUID(),
            expectedRevision: 1,
            answers: {
              [budget.id]: { state: 'value', value: 0 },
              [email.id]: { state: 'value', value: 'qa@example.invalid' },
            },
          });
        }
        const partial = crypto.randomUUID();
        await startIntake(tx, publicId, partial, 'e'.repeat(64));
        await saveDraft(tx, actor, workspace.id, formId, {
          operationId: crypto.randomUUID(),
          expectedRevision: 1,
          definition: { ...definition, title: 'Changed draft title' },
        });

        await run({
          tx,
          actor,
          workspaceId: workspace.id,
          formId,
          definition,
          ids,
          partial,
          budgetId: budget.id,
        });
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
          'id',
          'submittedAt',
          'version',
          'versionId',
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
