import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Transaction } from '../src/client.ts';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import {
  scheduleDeletion,
  readDeletion,
  cancelDeletion,
  findDeletion,
} from '../src/deletion.ts';
import { seedResponses } from './fixtures/forms.ts';
async function fixture(
  run: (
    tx: Transaction,
    owner: string,
    editor: string,
    workspaceId: string,
    responseId: string,
  ) => Promise<void>,
) {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL),
    rollback = Error('Rollback deletion fixtures');
  let actor = '';
  try {
    await expect(
      db.transaction(async (tx) => {
        const seeded = await seedResponses(tx, 'Deletion QA');
        actor = seeded.actor;
        const editor = crypto.randomUUID();
        await tx.insert(user).values({
          id: editor,
          name: 'Deletion QA',
          email: `${editor}@example.invalid`,
          emailVerified: true,
        });
        await tx.insert(membership).values({
          workspaceId: seeded.workspaceId,
          userId: editor,
          role: 'editor',
        });
        await run(tx, actor, editor, seeded.workspaceId, seeded.ids[0]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      (
        await db.execute(
          sql`select count(*)::integer as remaining from public."user" where id=${actor}`,
        )
      ).rows,
    ).toEqual([{ remaining: 0 }]);
  } finally {
    await close();
  }
}

it('denies forged roles, tenants and direct metadata access', async () => {
  await fixture(async (tx, owner, editor, workspaceId, responseId) => {
    const target = { kind: 'response' as const, targetId: responseId },
      input = {
        requestId: crypto.randomUUID(),
        confirmation: 'DELETE',
        acknowledgeDeletion: true as const,
      };
    expect(await findDeletion(tx, owner, workspaceId, target)).toBeNull();
    await expect(findDeletion(tx, editor, workspaceId, target)).rejects.toThrow(
      'FORBIDDEN',
    );
    await expect(
      findDeletion(tx, owner, crypto.randomUUID(), target),
    ).rejects.toThrow('WORKSPACE_NOT_FOUND');
    await expect(
      findDeletion(tx, editor, workspaceId, {
        kind: 'workspace',
        targetId: crypto.randomUUID(),
      }),
    ).rejects.toThrow('INVALID_DELETION_TARGET');
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
  });
}, 30000);

it('keeps duplicate and cancelled deletion identities stable', async () => {
  await fixture(async (tx, owner, editor, workspaceId, responseId) => {
    const target = { kind: 'response' as const, targetId: responseId },
      input = {
        requestId: crypto.randomUUID(),
        confirmation: 'DELETE',
        acknowledgeDeletion: true as const,
      };
    const first = await scheduleDeletion(tx, owner, workspaceId, target, input);
    expect(first).toMatchObject({
      id: input.requestId,
      state: 'scheduled',
      revision: 1,
      targetId: responseId,
    });
    expect(await findDeletion(tx, owner, workspaceId, target)).toEqual(first);
    await expect(findDeletion(tx, editor, workspaceId, target)).rejects.toThrow(
      'FORBIDDEN',
    );
    expect(Date.parse(first.notBefore) - Date.parse(first.requestedAt)).toBe(
      86400000,
    );
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
    const cancelled = await cancelDeletion(tx, owner, workspaceId, first.id, {
      expectedRevision: 1,
    });
    expect(cancelled).toMatchObject({ state: 'cancelled', revision: 2 });
    expect(await findDeletion(tx, owner, workspaceId, target)).toEqual(
      cancelled,
    );
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
  });
}, 30000);

it('freezes new requests until workspace deletion is cancelled', async () => {
  await fixture(async (tx, owner, editor, workspaceId, responseId) => {
    const target = { kind: 'response' as const, targetId: responseId },
      input = {
        requestId: crypto.randomUUID(),
        confirmation: 'DELETE',
        acknowledgeDeletion: true as const,
      };
    const first = await scheduleDeletion(tx, owner, workspaceId, target, input);
    await cancelDeletion(tx, owner, workspaceId, first.id, {
      expectedRevision: 1,
    });
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
    expect(await findDeletion(tx, owner, workspaceId, target)).toEqual(next);
    expect(
      await findDeletion(tx, owner, workspaceId, workspaceTarget),
    ).toMatchObject({ state: 'cancelled' });
  });
}, 30000);
