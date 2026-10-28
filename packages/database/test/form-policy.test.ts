import { expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace, inWorkspace } from '../src/workspaces.ts';
import { form, formDraft, draftOperation } from '../src/form-schema.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';

it('enforces membership-backed form policies, composite tenant keys and immutable receipts', async () => {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = new Error('Rollback form policy fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const first = crypto.randomUUID(),
          second = crypto.randomUUID(),
          id = crypto.randomUUID();
        await tx.insert(user).values(
          [first, second].map((id) => ({
            id,
            name: 'Form policy QA',
            email: `${id}@example.invalid`,
            emailVerified: true,
          })),
        );
        const a = await createWorkspace(tx, first, {
          id: crypto.randomUUID(),
          name: 'Forms QA',
          segment: 'agency',
        });
        const b = await createWorkspace(tx, second, {
          id: crypto.randomUUID(),
          name: 'Other QA',
          segment: 'startup',
        });
        await inWorkspace(tx, first, a.id, 'forms.write', async (scoped) => {
          await scoped
            .insert(membership)
            .values({ workspaceId: a.id, userId: second, role: 'viewer' });
          await scoped
            .insert(form)
            .values({ id, workspaceId: a.id, createdBy: first });
          await scoped.insert(formDraft).values({
            formId: id,
            workspaceId: a.id,
            revision: 1,
            definition: formFixture().definition,
            updatedBy: first,
          });
          await scoped.insert(draftOperation).values({
            id,
            formId: id,
            workspaceId: a.id,
            actorId: first,
            baseRevision: 0,
            resultRevision: 1,
            payloadHash: '0'.repeat(64),
          });
        });
        await inWorkspace(
          tx,
          second,
          a.id,
          'responses.read',
          async (scoped) => {
            expect(await scoped.select().from(form)).toHaveLength(1);
            await scoped.execute(
              sql`select set_config('snapform.role', 'owner', true)`,
            );
            expect(
              await scoped
                .update(formDraft)
                .set({ revision: 2 })
                .where(eq(formDraft.formId, id))
                .returning(),
            ).toHaveLength(0);
            await expect(
              scoped.transaction(async (savepoint) => {
                await savepoint.insert(form).values({
                  id: crypto.randomUUID(),
                  workspaceId: a.id,
                  createdBy: second,
                });
              }),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
          },
        );
        await inWorkspace(tx, second, b.id, 'forms.write', async (scoped) => {
          expect(await scoped.select().from(formDraft)).toHaveLength(0);
          await expect(
            scoped.transaction(async (savepoint) => {
              await savepoint.insert(formDraft).values({
                formId: id,
                workspaceId: b.id,
                revision: 1,
                definition: formFixture().definition,
                updatedBy: second,
              });
            }),
          ).rejects.toMatchObject({ cause: { code: '23503' } });
        });
        const permissions = await tx.execute<{ mutable: boolean }>(
          sql`select has_table_privilege(current_user, 'public.draft_operation', 'UPDATE') or has_table_privilege(current_user, 'public.draft_operation', 'DELETE') as mutable`,
        );
        expect(permissions.rows[0].mutable).toBe(false);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(await db.select().from(form)).toHaveLength(0);
  } finally {
    await close();
  }
}, 30000);
