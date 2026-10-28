import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace, inWorkspace } from '../src/workspaces.ts';
import { form, formDraft, draftOperation } from '../src/form-schema.ts';
import { createForm, getForm, saveDraft, listForms } from '../src/forms.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
async function fixture(
  run: (tx: Transaction, actor: string, workspaceId: string) => Promise<void>,
) {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = new Error('Rollback draft fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID();
        await tx.insert(user).values({
          id: actor,
          name: 'Draft QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Draft QA',
          segment: 'consultant',
        });
        await run(tx, actor, workspace.id);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}
it(
  'deduplicates saves and never overwrites a newer draft with a stale operation',
  async () =>
    fixture(async (tx, actor, workspaceId) => {
      const input = {
        id: crypto.randomUUID(),
        definition: formFixture().definition,
      };
      const created = await createForm(tx, actor, workspaceId, input);
      expect(created.revision).toBe(1);
      expect((await createForm(tx, actor, workspaceId, input)).id).toBe(
        input.id,
      );
      await expect(
        createForm(tx, actor, workspaceId, {
          ...input,
          definition: { ...input.definition, title: 'Different' },
        }),
      ).rejects.toThrow('FORM_CONFLICT');
      const first = {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        definition: { ...input.definition, title: 'First edit' },
      };
      expect(
        await saveDraft(tx, actor, workspaceId, input.id, first),
      ).toMatchObject({ revision: 2, currentRevision: 2 });
      expect(
        await saveDraft(tx, actor, workspaceId, input.id, first),
      ).toMatchObject({ revision: 2, currentRevision: 2 });
      await expect(
        saveDraft(tx, actor, workspaceId, input.id, {
          ...first,
          definition: input.definition,
        }),
      ).rejects.toThrow('OPERATION_CONFLICT');
      await expect(
        saveDraft(tx, actor, workspaceId, input.id, {
          ...first,
          operationId: crypto.randomUUID(),
        }),
      ).rejects.toThrow('DRAFT_CONFLICT');
      const second = {
        operationId: crypto.randomUUID(),
        expectedRevision: 2,
        definition: { ...input.definition, title: 'Second edit' },
      };
      await saveDraft(tx, actor, workspaceId, input.id, second);
      expect(
        await saveDraft(tx, actor, workspaceId, input.id, first),
      ).toMatchObject({ revision: 2, currentRevision: 3 });
      expect(
        (await getForm(tx, actor, workspaceId, input.id)).definition.title,
      ).toBe('Second edit');
      await expect(
        getForm(tx, actor, workspaceId, crypto.randomUUID()),
      ).rejects.toThrow('FORM_NOT_FOUND');
      await expect(
        getForm(tx, crypto.randomUUID(), workspaceId, input.id),
      ).rejects.toThrow('WORKSPACE_NOT_FOUND');
      expect(
        await inWorkspace(
          tx,
          actor,
          workspaceId,
          'forms.write',
          async (scoped) =>
            scoped
              .select()
              .from(draftOperation)
              .where(eq(draftOperation.formId, input.id)),
        ),
      ).toHaveLength(3);
    }),
  30000,
);
it(
  'pages tied database timestamps without losing or repeating form identities',
  async () =>
    fixture(async (tx, actor, workspaceId) => {
      const ids = Array.from({ length: 22 }, () => crypto.randomUUID());
      await inWorkspace(
        tx,
        actor,
        workspaceId,
        'forms.write',
        async (scoped) => {
          await scoped
            .insert(form)
            .values(ids.map((id) => ({ id, workspaceId, createdBy: actor })));
          await scoped.insert(formDraft).values(
            ids.map((formId) => ({
              formId,
              workspaceId,
              revision: 1,
              definition: formFixture().definition,
              updatedBy: actor,
            })),
          );
        },
      );
      const first = await listForms(tx, actor, workspaceId);
      expect(first.forms).toHaveLength(20);
      expect(first.nextCursor).not.toBeNull();
      if (!first.nextCursor) throw new Error('Expected another page');
      const second = await listForms(tx, actor, workspaceId, first.nextCursor);
      expect(second.forms).toHaveLength(2);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.forms, ...second.forms].map((item) => item.id)),
      ).toEqual(new Set(ids));
    }),
  30000,
);
