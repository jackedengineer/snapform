import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake } from '../src/intake.ts';
import {
  scheduleDeletion,
  readDeletion,
  cancelDeletion,
} from '../src/deletion.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
it('schedules explicit owner deletion, keeps a cancellation window and never revives cancelled request identities', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL),
    rollback = Error('Rollback deletion fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const owner = crypto.randomUUID(),
          editor = crypto.randomUUID(),
          workspaceId = crypto.randomUUID(),
          formId = crypto.randomUUID(),
          responseId = crypto.randomUUID();
        for (const id of [owner, editor])
          await tx.insert(user).values({
            id,
            name: 'Deletion QA',
            email: `${id}@example.invalid`,
            emailVerified: true,
          });
        await createWorkspace(tx, owner, {
          id: workspaceId,
          name: 'Deletion QA',
          segment: 'agency',
        });
        await tx
          .insert(membership)
          .values({ workspaceId, userId: editor, role: 'editor' });
        await createForm(tx, owner, workspaceId, {
          id: formId,
          definition: formFixture().definition,
        });
        const publication = await publishForm(tx, owner, workspaceId, formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        });
        const publicId = publication.publication?.publicId;
        if (!publicId) throw Error('Fixture publication missing');
        await startIntake(tx, publicId, responseId, 'a'.repeat(64));
        const target = { kind: 'response' as const, targetId: responseId },
          input = {
            requestId: crypto.randomUUID(),
            confirmation: 'DELETE',
            acknowledgeDeletion: true as const,
          };
        await expect(
          scheduleDeletion(tx, editor, workspaceId, target, input),
        ).rejects.toThrow('FORBIDDEN');
        // The SQL boundary checks membership even when a caller forges the role GUC.
        await expect(
          tx.transaction(async (forged) => {
            await forged.execute(
              sql`select set_config('snapform.user_id',${editor},true),set_config('snapform.workspace_id',${workspaceId},true),set_config('snapform.role','owner',true)`,
            );
            await forged.execute(
              sql`select public.schedule_deletion(${input.requestId}::uuid,${workspaceId}::uuid,'response',${responseId}::uuid,'DELETE',true)`,
            );
          }),
        ).rejects.toMatchObject({ cause: { message: 'FORBIDDEN' } });
        await expect(
          scheduleDeletion(tx, owner, workspaceId, target, {
            ...input,
            acknowledgeDeletion: false,
          }),
        ).rejects.toThrow();
        await expect(
          scheduleDeletion(tx, owner, workspaceId, target, {
            ...input,
            confirmation: 'delete',
          }),
        ).rejects.toThrow('INVALID_DELETION_CONFIRMATION');
        const first = await scheduleDeletion(
          tx,
          owner,
          workspaceId,
          target,
          input,
        );
        expect(first).toMatchObject({
          id: input.requestId,
          state: 'scheduled',
          revision: 1,
          targetId: responseId,
        });
        expect(
          Date.parse(first.notBefore) - Date.parse(first.requestedAt),
        ).toBe(86400000);
        expect(
          await scheduleDeletion(tx, owner, workspaceId, target, input),
        ).toEqual(first);
        await expect(
          scheduleDeletion(tx, owner, workspaceId, target, {
            ...input,
            requestId: crypto.randomUUID(),
          }),
        ).rejects.toThrow('DELETION_CONFLICT');
        await expect(
          cancelDeletion(tx, editor, workspaceId, first.id, {
            expectedRevision: 1,
          }),
        ).rejects.toThrow('FORBIDDEN');
        await expect(
          cancelDeletion(tx, owner, workspaceId, first.id, {
            expectedRevision: 2,
          }),
        ).rejects.toThrow('DELETION_CONFLICT');
        const cancelled = await cancelDeletion(
          tx,
          owner,
          workspaceId,
          first.id,
          { expectedRevision: 1 },
        );
        expect(cancelled).toMatchObject({ state: 'cancelled', revision: 2 });
        expect(
          await cancelDeletion(tx, owner, workspaceId, first.id, {
            expectedRevision: 1,
          }),
        ).toEqual(cancelled);
        expect(
          await scheduleDeletion(tx, owner, workspaceId, target, input),
        ).toEqual(cancelled);
        expect(await readDeletion(tx, owner, workspaceId, first.id)).toEqual(
          cancelled,
        );
        await expect(
          readDeletion(tx, owner, workspaceId, crypto.randomUUID()),
        ).rejects.toThrow('DELETION_NOT_FOUND');
        await expect(
          readDeletion(tx, owner, crypto.randomUUID(), first.id),
        ).rejects.toThrow('WORKSPACE_NOT_FOUND');
        const workspaceTarget = {
          kind: 'workspace' as const,
          targetId: workspaceId,
        };
        await expect(
          scheduleDeletion(tx, owner, workspaceId, workspaceTarget, {
            ...input,
            requestId: crypto.randomUUID(),
            confirmation: 'DELETE',
          }),
        ).rejects.toThrow('INVALID_DELETION_CONFIRMATION');
        const workspaceRequest = await scheduleDeletion(
          tx,
          owner,
          workspaceId,
          workspaceTarget,
          {
            ...input,
            requestId: crypto.randomUUID(),
            confirmation: 'Deletion QA',
          },
        );
        await expect(
          scheduleDeletion(tx, owner, workspaceId, target, {
            ...input,
            requestId: crypto.randomUUID(),
          }),
        ).rejects.toThrow('WORKSPACE_DELETION_PENDING');
        expect(
          (
            await cancelDeletion(tx, owner, workspaceId, workspaceRequest.id, {
              expectedRevision: 1,
            })
          ).state,
        ).toBe('cancelled');
        const next = await scheduleDeletion(tx, owner, workspaceId, target, {
          ...input,
          requestId: crypto.randomUUID(),
        });
        expect(next.state).toBe('scheduled');
        const permissions = await tx.execute(
          sql`select has_table_privilege(current_user,'public.deletion_request','SELECT') as direct_read,has_table_privilege(current_user,'public.deletion_request','UPDATE') as direct_write,has_function_privilege(current_user,'public.pending_workspace_deletion(uuid)','EXECUTE') as unscoped_status,has_function_privilege('snapform_jobs','public.schedule_deletion(uuid,uuid,text,uuid,text,boolean)','EXECUTE') as jobs_schedule`,
        );
        expect(permissions.rows).toEqual([
          {
            direct_read: false,
            direct_write: false,
            unscoped_status: false,
            jobs_schedule: false,
          },
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);
