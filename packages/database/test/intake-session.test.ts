import { expect, it } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import type { Transaction } from '../src/client.ts';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm, saveDraft } from '../src/forms.ts';
import { publishForm, unpublishForm } from '../src/publication.ts';
import { responseSession } from '../src/intake-schema.ts';
import { startIntake, getIntake, mutateIntake } from '../src/intake.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
async function fixture(
  run: (
    tx: Transaction,
    actor: string,
    workspaceId: string,
    formId: string,
    publicId: string,
  ) => Promise<void>,
) {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = new Error('Rollback intake fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID(),
          formId = crypto.randomUUID();
        await tx.insert(user).values({
          id: actor,
          name: 'Intake QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Intake QA',
          segment: 'agency',
        });
        await createForm(tx, actor, workspace.id, {
          id: formId,
          definition: formFixture().definition,
        });
        const published = await publishForm(tx, actor, workspace.id, formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        });
        if (!published.publication) throw new Error('Expected publication');
        await run(
          tx,
          actor,
          workspace.id,
          formId,
          published.publication.publicId,
        );
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}
it(
  'pins each intake to its opened version and revokes access when the form is unpublished',
  async () =>
    fixture(async (tx, actor, workspaceId, formId, publicId) => {
      const id = crypto.randomUUID(),
        hash = '1'.repeat(64);
      const first = await startIntake(tx, publicId, id, hash);
      expect(first).toMatchObject({
        id,
        publicId,
        revision: 1,
        status: 'collecting',
        answers: {},
      });
      expect(Date.parse(first.expiresAt)).toBeGreaterThan(
        Date.now() + 6 * 86400000,
      );
      expect(Object.keys(first)).not.toContain('capabilityHash');
      await saveDraft(tx, actor, workspaceId, formId, {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        definition: {
          ...formFixture().definition,
          title: 'New published intake',
        },
      });
      const published = await publishForm(tx, actor, workspaceId, formId, {
        versionId: crypto.randomUUID(),
        expectedRevision: 2,
      });
      expect((await getIntake(tx, publicId, id, hash)).definition).toEqual(
        first.definition,
      );
      const second = await startIntake(
        tx,
        publicId,
        crypto.randomUUID(),
        '2'.repeat(64),
      );
      expect(second.definition.title).toBe('New published intake');
      expect(second.versionId).toBe(published.versionId);
      await unpublishForm(tx, actor, workspaceId, formId, {
        expectedVersionId: published.versionId,
      });
      await expect(getIntake(tx, publicId, id, hash)).rejects.toThrow(
        'INTAKE_UNAVAILABLE',
      );
      await expect(
        startIntake(tx, publicId, crypto.randomUUID(), '3'.repeat(64)),
      ).rejects.toThrow('INTAKE_UNAVAILABLE');
    }),
  30000,
);
it(
  'requires the exact public/session capability and prevents ownership or credential changes',
  async () =>
    fixture(async (tx, _actor, workspaceId, formId, publicId) => {
      const id = crypto.randomUUID(),
        hash = '4'.repeat(64),
        otherId = crypto.randomUUID();
      const first = await startIntake(tx, publicId, id, hash);
      await startIntake(tx, publicId, otherId, '5'.repeat(64));
      await expect(getIntake(tx, publicId, id, '5'.repeat(64))).rejects.toThrow(
        'INTAKE_UNAVAILABLE',
      );
      await expect(
        getIntake(tx, crypto.randomUUID(), id, hash),
      ).rejects.toThrow('INTAKE_UNAVAILABLE');
      await expect(getIntake(tx, publicId, otherId, hash)).rejects.toThrow(
        'INTAKE_UNAVAILABLE',
      );
      await getIntake(tx, publicId, id, hash);
      await expect(
        tx.transaction(async (nested) => {
          await nested
            .update(responseSession)
            .set({ capabilityHash: '6'.repeat(64) })
            .where(eq(responseSession.id, id));
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
      await expect(
        tx.transaction(async (nested) => {
          await nested
            .update(responseSession)
            .set({ versionId: crypto.randomUUID() })
            .where(eq(responseSession.id, id));
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
      await tx.execute(
        sql`select set_config('snapform.intake_id','',true),set_config('snapform.intake_hash','',true),set_config('snapform.public_id','',true),set_config('snapform.role','owner',true)`,
      );
      expect(await tx.select().from(responseSession)).toHaveLength(0);
      await expect(
        tx.transaction(async (nested) =>
          nested
            .update(responseSession)
            .set({ revision: 2 })
            .where(eq(responseSession.id, id))
            .returning(),
        ),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
      await expect(
        tx.transaction(async (nested) => {
          await nested.insert(responseSession).values({
            id: crypto.randomUUID(),
            workspaceId,
            formId,
            versionId: first.versionId,
            capabilityHash: '7'.repeat(64),
            expiresAt: new Date(Date.now() + 3600000),
          });
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
      await expect(
        tx.transaction(async (nested) => {
          await nested
            .delete(responseSession)
            .where(eq(responseSession.id, id));
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    }),
  30000,
);
it(
  'keeps response events scoped and denies direct runtime dispatch mutations',
  async () =>
    fixture(async (tx, _actor, _workspaceId, _formId, publicId) => {
      const id = crypto.randomUUID(),
        hash = '7'.repeat(64);
      const session = await startIntake(tx, publicId, id, hash);
      const fields = session.definition.pages.flatMap((page) => page.blocks);
      const budget = fields.find((field) => field.type === 'number');
      const contact = fields.find((field) => field.type === 'email');
      if (!budget || !contact) throw new Error('Missing fixture fields');
      await mutateIntake(tx, publicId, id, hash, 'submit', {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        answers: {
          [budget.id]: { state: 'value', value: 0 },
          [contact.id]: { state: 'value', value: 'qa@example.invalid' },
        },
      });
      expect(
        (
          await tx.execute(
            sql`select id from public.response_outbox where session_id=${id}::uuid`,
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await tx.execute(sql`select has_table_privilege(current_user,'public.response_outbox','INSERT') as insert,
      has_table_privilege(current_user,'public.response_outbox','UPDATE') as update,
      has_table_privilege(current_user,'public.response_outbox','DELETE') as delete`)
        ).rows,
      ).toEqual([{ insert: false, update: false, delete: false }]);
      const rollback = new Error('Restore owned fixture scope');
      await expect(
        tx.transaction(async (unscoped) => {
          await unscoped.execute(
            sql`select set_config('snapform.intake_hash','',true),set_config('snapform.user_id','',true),set_config('snapform.workspace_id','',true)`,
          );
          expect(
            (
              await unscoped.execute(
                sql`select id from public.response_outbox where session_id=${id}::uuid`,
              )
            ).rows,
          ).toHaveLength(0);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    }),
  30000,
);
it(
  'rolls back a submission, usage and its outbox event together',
  async () =>
    fixture(async (tx, actor, _workspaceId, _formId, publicId) => {
      const id = crypto.randomUUID(),
        hash = '6'.repeat(64);
      const session = await startIntake(tx, publicId, id, hash);
      const fields = session.definition.pages.flatMap((page) => page.blocks);
      const budget = fields.find((field) => field.type === 'number');
      const contact = fields.find((field) => field.type === 'email');
      if (!budget || !contact) throw new Error('Missing fixture fields');
      const rollback = new Error(
        'Abort synthetic submission after the outbox write',
      );
      await expect(
        tx.transaction(async (attempt) => {
          await mutateIntake(attempt, publicId, id, hash, 'submit', {
            operationId: crypto.randomUUID(),
            expectedRevision: 1,
            answers: {
              [budget.id]: { state: 'value', value: 0 },
              [contact.id]: { state: 'value', value: 'qa@example.invalid' },
            },
          });
          expect(
            (
              await attempt.execute(
                sql`select id from public.response_outbox where session_id=${id}::uuid`,
              )
            ).rows,
          ).toHaveLength(1);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await getIntake(tx, publicId, id, hash)).toMatchObject({
        status: 'collecting',
        revision: 1,
        answers: {},
      });
      expect(
        (
          await tx.execute(
            sql`select id from public.response_outbox where session_id=${id}::uuid`,
          )
        ).rows,
      ).toHaveLength(0);
      await tx.execute(
        sql`select set_config('snapform.user_id',${actor},true)`,
      );
      expect(
        (
          await tx.execute(
            sql`select responses_used from public.trial_response_usage where owner_id=${actor}`,
          )
        ).rows,
      ).toEqual([{ responses_used: 0 }]);
    }),
  30000,
);
it(
  'returns the same scoped intake when admission is retried',
  async () =>
    fixture(async (tx, _actor, _workspaceId, _formId, publicId) => {
      const id = crypto.randomUUID(),
        hash = crypto.randomUUID().replaceAll('-', '').repeat(2);
      const first = await startIntake(tx, publicId, id, hash);
      expect(await startIntake(tx, publicId, id, hash)).toEqual(first);
      await expect(
        startIntake(tx, publicId, id, 'f'.repeat(64)),
      ).rejects.toThrow('INTAKE_UNAVAILABLE');
    }),
  30000,
);

it(
  'saves partial progress with immutable retry receipts and rejects invalid submission',
  async () =>
    fixture(async (tx, _actor, _workspaceId, _formId, publicId) => {
      const id = crypto.randomUUID(),
        hash = '8'.repeat(64);
      const session = await startIntake(tx, publicId, id, hash);
      const fields = session.definition.pages.flatMap((page) => page.blocks);
      const budget = fields.find((field) => field.type === 'number');
      const contact = fields.find((field) => field.type === 'email');
      if (!budget || !contact) throw new Error('Missing fixture fields');
      const progress = {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        answers: { [budget.id]: { state: 'value' as const, value: '-' } },
      };
      const first = await mutateIntake(
        tx,
        publicId,
        id,
        hash,
        'save',
        progress,
      );
      expect(first).toMatchObject({
        revision: 2,
        currentRevision: 2,
        status: 'collecting',
      });
      expect((await getIntake(tx, publicId, id, hash)).answers).toEqual(
        progress.answers,
      );
      expect(
        await mutateIntake(tx, publicId, id, hash, 'save', progress),
      ).toEqual(first);
      await expect(
        mutateIntake(tx, publicId, id, hash, 'save', {
          ...progress,
          answers: {},
        }),
      ).rejects.toThrow('INTAKE_OPERATION_CONFLICT');
      await expect(
        mutateIntake(tx, publicId, id, hash, 'save', {
          ...progress,
          operationId: crypto.randomUUID(),
        }),
      ).rejects.toThrow('INTAKE_CONFLICT');
      await expect(
        mutateIntake(tx, publicId, id, hash, 'submit', {
          ...progress,
          operationId: crypto.randomUUID(),
          expectedRevision: 2,
        }),
      ).rejects.toThrow('INVALID_INTAKE_ANSWERS');
    }),
  30000,
);

it(
  'submits once and preserves receipts after unpublishing',
  async () =>
    fixture(async (tx, actor, workspaceId, formId, publicId) => {
      const id = crypto.randomUUID(),
        hash = '8'.repeat(64);
      const session = await startIntake(tx, publicId, id, hash);
      const fields = session.definition.pages.flatMap((page) => page.blocks);
      const budget = fields.find((field) => field.type === 'number');
      const contact = fields.find((field) => field.type === 'email');
      if (!budget || !contact) throw new Error('Missing fixture fields');
      const progress = {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        answers: { [budget.id]: { state: 'value' as const, value: '-' } },
      };
      await mutateIntake(tx, publicId, id, hash, 'save', progress);
      const submit = {
        operationId: crypto.randomUUID(),
        expectedRevision: 2,
        answers: {
          [budget.id]: { state: 'value' as const, value: '0' },
          [contact.id]: {
            state: 'value' as const,
            value: 'qa@EXAMPLE.INVALID',
          },
        },
      };
      expect(
        (
          await tx.execute(
            sql`select id from public.response_outbox where session_id=${id}::uuid`,
          )
        ).rows,
      ).toHaveLength(0);
      const receipt = await mutateIntake(
        tx,
        publicId,
        id,
        hash,
        'submit',
        submit,
      );
      expect(receipt).toMatchObject({ revision: 3, status: 'submitted' });
      expect(
        await mutateIntake(tx, publicId, id, hash, 'submit', submit),
      ).toEqual(receipt);
      expect(
        await mutateIntake(tx, publicId, id, hash, 'save', progress),
      ).toMatchObject({
        revision: 2,
        currentRevision: 3,
        status: 'collecting',
      });
      const final = await getIntake(tx, publicId, id, hash);
      expect(final.status).toBe('submitted');
      expect(final.answers[budget.id]).toEqual({ state: 'value', value: 0 });
      await expect(
        mutateIntake(tx, publicId, id, hash, 'save', {
          ...progress,
          operationId: crypto.randomUUID(),
          expectedRevision: 3,
        }),
      ).rejects.toThrow('INTAKE_ALREADY_SUBMITTED');
      await tx.execute(
        sql`select set_config('snapform.user_id',${actor},true)`,
      );
      const used = await tx.execute<{ responses_used: number }>(
        sql`select responses_used from public.trial_response_usage where owner_id=${actor}`,
      );
      expect(used.rows[0]?.responses_used).toBe(1);
      expect(
        (
          await tx.execute(
            sql`select kind,count(*)::int as count from public.response_outbox where session_id=${id}::uuid group by kind`,
          )
        ).rows,
      ).toEqual([{ kind: 'response.submitted', count: 1 }]);
      const publication = await publishForm(tx, actor, workspaceId, formId, {
        versionId: crypto.randomUUID(),
        expectedRevision: 1,
      });
      await unpublishForm(tx, actor, workspaceId, formId, {
        expectedVersionId: publication.versionId,
      });
      expect((await getIntake(tx, publicId, id, hash)).status).toBe(
        'submitted',
      );
      expect(
        await mutateIntake(tx, publicId, id, hash, 'submit', submit),
      ).toEqual(receipt);
      await expect(
        mutateIntake(tx, publicId, id, '9'.repeat(64), 'submit', submit),
      ).rejects.toThrow('INTAKE_UNAVAILABLE');
    }),
  30000,
);
