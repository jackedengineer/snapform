import { expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace, inWorkspace } from '../src/workspaces.ts';
import { form } from '../src/form-schema.ts';
import { formVersion, formPublication } from '../src/publication-schema.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
it('isolates publication snapshots, protects immutable rows and validates pointer ownership', async () => {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = new Error('Rollback publication policy fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const owner = crypto.randomUUID(),
          viewer = crypto.randomUUID();
        await tx.insert(user).values(
          [owner, viewer].map((id) => ({
            id,
            name: 'Publication QA',
            email: `${id}@example.invalid`,
            emailVerified: true,
          })),
        );
        const workspace = await createWorkspace(tx, owner, {
          id: crypto.randomUUID(),
          name: 'Publication QA',
          segment: 'agency',
        });
        const other = await createWorkspace(tx, viewer, {
          id: crypto.randomUUID(),
          name: 'Other publication QA',
          segment: 'startup',
        });
        const formId = crypto.randomUUID(),
          versionId = crypto.randomUUID(),
          otherFormId = crypto.randomUUID();
        const version = {
          id: versionId,
          workspaceId: workspace.id,
          formId,
          number: 1,
          sourceRevision: 1,
          definition: formFixture().definition,
          createdBy: owner,
        };
        const pointer = {
          workspaceId: workspace.id,
          formId,
          publicId: crypto.randomUUID(),
          versionId,
          active: true,
          updatedBy: owner,
        };
        await inWorkspace(
          tx,
          owner,
          workspace.id,
          'forms.write',
          async (scoped) => {
            await scoped.insert(membership).values({
              workspaceId: workspace.id,
              userId: viewer,
              role: 'viewer',
            });
            await scoped.insert(form).values(
              [formId, otherFormId].map((id) => ({
                id,
                workspaceId: workspace.id,
                createdBy: owner,
              })),
            );
            await scoped.insert(formVersion).values(version);
            await scoped.insert(formPublication).values(pointer);
            expect(
              (await scoped.select().from(formVersion))[0].definition,
            ).toEqual(version.definition);
            await expect(
              scoped.transaction(async (nested) => {
                await nested
                  .update(formVersion)
                  .set({
                    definition: { ...version.definition, title: 'Tampered' },
                  })
                  .where(eq(formVersion.id, versionId));
              }),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
              scoped.transaction(async (nested) => {
                await nested
                  .delete(formVersion)
                  .where(eq(formVersion.id, versionId));
              }),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
              scoped.transaction(async (nested) => {
                await nested.insert(formPublication).values({
                  ...pointer,
                  formId: otherFormId,
                  publicId: crypto.randomUUID(),
                });
              }),
            ).rejects.toMatchObject({ cause: { code: '23503' } });
            await expect(
              scoped.transaction(async (nested) => {
                await nested.insert(formVersion).values({
                  ...version,
                  id: crypto.randomUUID(),
                  number: 2,
                  createdBy: viewer,
                });
              }),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
          },
        );
        await inWorkspace(
          tx,
          viewer,
          workspace.id,
          'responses.read',
          async (scoped) => {
            expect(await scoped.select().from(formVersion)).toHaveLength(1);
            await scoped.execute(
              sql`select set_config('snapform.role', 'owner', true)`,
            );
            expect(
              await scoped
                .update(formPublication)
                .set({ active: false, updatedBy: viewer })
                .returning(),
            ).toHaveLength(0);
            await expect(
              scoped.transaction(async (nested) => {
                await nested.insert(formVersion).values({
                  ...version,
                  id: crypto.randomUUID(),
                  number: 2,
                  createdBy: viewer,
                });
              }),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
          },
        );
        await inWorkspace(
          tx,
          viewer,
          other.id,
          'forms.write',
          async (scoped) => {
            expect(await scoped.select().from(formVersion)).toHaveLength(0);
            expect(await scoped.select().from(formPublication)).toHaveLength(0);
            await expect(
              scoped.transaction(async (nested) => {
                await nested.insert(formVersion).values({
                  ...version,
                  workspaceId: other.id,
                  id: crypto.randomUUID(),
                  createdBy: viewer,
                });
              }),
            ).rejects.toMatchObject({ cause: { code: '23503' } });
          },
        );
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(await db.select().from(formVersion)).toHaveLength(0);
    expect(await db.select().from(formPublication)).toHaveLength(0);
  } finally {
    await close();
  }
}, 30000);
