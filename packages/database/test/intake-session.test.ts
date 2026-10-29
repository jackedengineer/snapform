import { expect, it } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import type { Transaction } from '../src/client.ts';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm, saveDraft } from '../src/forms.ts';
import { publishForm, unpublishForm } from '../src/publication.ts';
import { responseSession } from '../src/intake-schema.ts';
import { startIntake, getIntake } from '../src/intake.ts';
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
      expect(Date.parse(first.expiresAt)).toBeGreaterThan(Date.now());
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
      expect(
        await tx
          .update(responseSession)
          .set({ revision: 2 })
          .where(eq(responseSession.id, id))
          .returning(),
      ).toHaveLength(0);
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
