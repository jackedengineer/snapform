import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import {
  getWorkspaceRetention,
  saveWorkspaceRetention,
} from '../src/retention.ts';

it('keeps defaults, serializes owner changes and denies forged role/tenant writes', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback retention fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const owner = crypto.randomUUID(),
          editor = crypto.randomUUID(),
          viewer = crypto.randomUUID();
        for (const id of [owner, editor, viewer])
          await tx.insert(user).values({
            id,
            name: 'Retention QA',
            email: `${id}@example.invalid`,
            emailVerified: true,
          });
        const workspace = await createWorkspace(tx, owner, {
          id: crypto.randomUUID(),
          name: 'Retention QA',
          segment: 'agency',
        });
        await tx.insert(membership).values([
          { workspaceId: workspace.id, userId: editor, role: 'editor' },
          { workspaceId: workspace.id, userId: viewer, role: 'viewer' },
        ]);
        expect(
          await getWorkspaceRetention(tx, owner, workspace.id),
        ).toMatchObject({
          workspaceId: workspace.id,
          days: 90,
          revision: 0,
          updatedAt: null,
          role: 'owner',
        });
        await expect(
          saveWorkspaceRetention(tx, owner, workspace.id, {
            days: 30,
            expectedRevision: 0,
            acknowledgeDeletion: false,
          }),
        ).rejects.toThrow();
        const first = await saveWorkspaceRetention(tx, owner, workspace.id, {
          days: 30,
          expectedRevision: 0,
          acknowledgeDeletion: true,
        });
        expect(first).toMatchObject({ days: 30, revision: 1, role: 'owner' });
        expect(first.updatedAt).not.toBeNull();
        await expect(
          saveWorkspaceRetention(tx, owner, workspace.id, {
            days: 365,
            expectedRevision: 0,
            acknowledgeDeletion: true,
          }),
        ).rejects.toThrow('RETENTION_CONFLICT');
        expect(
          await getWorkspaceRetention(tx, viewer, workspace.id),
        ).toMatchObject({ days: 30, revision: 1, role: 'viewer' });
        for (const actor of [editor, viewer])
          await expect(
            saveWorkspaceRetention(tx, actor, workspace.id, {
              days: 365,
              expectedRevision: 1,
              acknowledgeDeletion: true,
            }),
          ).rejects.toThrow('FORBIDDEN');
        await expect(
          getWorkspaceRetention(tx, crypto.randomUUID(), workspace.id),
        ).rejects.toThrow('WORKSPACE_NOT_FOUND');
        await expect(
          getWorkspaceRetention(tx, owner, crypto.randomUUID()),
        ).rejects.toThrow('WORKSPACE_NOT_FOUND');
        const next = await saveWorkspaceRetention(tx, owner, workspace.id, {
          days: 365,
          expectedRevision: 1,
          acknowledgeDeletion: true,
        });
        expect(next).toMatchObject({ days: 365, revision: 2 });
        await tx.execute(
          sql`select set_config('snapform.user_id',${editor},true),set_config('snapform.workspace_id',${workspace.id},true),set_config('snapform.role','owner',true)`,
        );
        const forged = await tx.execute(
          sql`update workspace_retention set days=30 where workspace_id=${workspace.id}::uuid returning workspace_id`,
        );
        expect(forged.rows).toEqual([]);
        await expect(
          tx.transaction(async (nested) => {
            await nested.execute(
              sql`delete from workspace_retention where workspace_id=${workspace.id}::uuid`,
            );
          }),
        ).rejects.toThrow();
        expect(
          await getWorkspaceRetention(tx, owner, workspace.id),
        ).toMatchObject({ days: 365, revision: 2 });
        await expect(
          tx.transaction(async (nested) => {
            await nested.execute(
              sql`update workspace_retention set days=31 where workspace_id=${workspace.id}::uuid`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: '23514' } });
        const privileges = await tx.execute(sql`select
          c.relrowsecurity as rls, c.relforcerowsecurity as forced,
          has_table_privilege(current_user,'public.workspace_retention','SELECT') as can_read,
          has_table_privilege(current_user,'public.workspace_retention','DELETE') as can_delete,
          has_table_privilege(current_user,'public.workspace_retention','TRUNCATE') as can_truncate,
          has_table_privilege('snapform_jobs','public.workspace_retention','SELECT') as jobs_read
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='workspace_retention'`);
        expect(privileges.rows).toEqual([
          {
            rls: true,
            forced: true,
            can_read: true,
            can_delete: false,
            can_truncate: false,
            jobs_read: false,
          },
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);
