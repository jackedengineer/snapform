import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace, inWorkspace } from '../src/workspaces.ts';
import { scheduleDeletion, cancelDeletion } from '../src/deletion.ts';
import { createForm } from '../src/forms.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
import {
  getWebhookSettings,
  getWebhookSigningSecret,
} from '../src/webhook-settings.ts';
import { listWebhookDeliveries } from '../src/webhook-deliveries.ts';
it('sets actual local membership context and freezes private writes during workspace deletion', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback scoped workspace fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const owner = crypto.randomUUID(),
          viewer = crypto.randomUUID(),
          workspaceId = crypto.randomUUID();
        for (const id of [owner, viewer])
          await tx.insert(user).values({
            id,
            name: 'Scope QA',
            email: `${id}@example.invalid`,
            emailVerified: true,
          });
        await createWorkspace(tx, owner, {
          id: workspaceId,
          name: 'Scope QA',
          segment: 'agency',
        });
        await tx
          .insert(membership)
          .values({ workspaceId, userId: viewer, role: 'viewer' });
        const formId = crypto.randomUUID(),
          master = btoa('s'.repeat(32));
        await createForm(tx, owner, workspaceId, {
          id: formId,
          definition: formFixture().definition,
        });
        await tx.execute(
          sql`select set_config('snapform.role','owner',true),set_config('snapform.public_id','synthetic',true),set_config('snapform.intake_hash','synthetic',true)`,
        );
        expect(
          (
            await tx.execute(
              sql`select * from public.scope_workspace(${viewer},${workspaceId}::uuid,false)`,
            )
          ).rows,
        ).toEqual([{ role: 'viewer', deletion_pending: false }]);
        expect(
          (
            await tx.execute(
              sql`select current_setting('snapform.user_id') as actor,current_setting('snapform.workspace_id') as workspace,current_setting('snapform.role') as role,current_setting('snapform.public_id') as public_id,current_setting('snapform.intake_hash') as capability`,
            )
          ).rows,
        ).toEqual([
          {
            actor: viewer,
            workspace: workspaceId,
            role: 'viewer',
            public_id: '',
            capability: '',
          },
        ]);
        await expect(
          tx.transaction(async (nested) =>
            nested.execute(
              sql`select * from public.scope_workspace(${crypto.randomUUID()},${workspaceId}::uuid,true)`,
            ),
          ),
        ).rejects.toMatchObject({ cause: { message: 'WORKSPACE_NOT_FOUND' } });
        await expect(
          tx.transaction(async (nested) =>
            nested.execute(
              sql`select * from public.scope_workspace(${owner},${workspaceId}::uuid,null)`,
            ),
          ),
        ).rejects.toMatchObject({ cause: { message: 'FORBIDDEN' } });
        const request = await scheduleDeletion(
          tx,
          owner,
          workspaceId,
          { kind: 'workspace', targetId: workspaceId },
          {
            requestId: crypto.randomUUID(),
            confirmation: 'Scope QA',
            acknowledgeDeletion: true,
          },
        );
        expect(
          (
            await tx.execute(
              sql`select * from public.scope_workspace(${viewer},${workspaceId}::uuid,false)`,
            )
          ).rows,
        ).toEqual([{ role: 'viewer', deletion_pending: false }]);
        expect(
          await getWebhookSettings(tx, owner, workspaceId, formId, master),
        ).toMatchObject({ enabled: false, configurationId: null });
        expect(
          await listWebhookDeliveries(tx, owner, workspaceId, formId),
        ).toEqual({ deliveries: [] });
        await expect(
          getWebhookSigningSecret(
            tx,
            owner,
            workspaceId,
            formId,
            {
              configurationId: crypto.randomUUID(),
              expectedRevision: 1,
            },
            master,
          ),
        ).rejects.toThrow('WEBHOOK_SETTINGS_CONFLICT');
        await expect(
          getWebhookSettings(tx, viewer, workspaceId, formId, master),
        ).rejects.toThrow('FORBIDDEN');
        await expect(
          inWorkspace(tx, owner, workspaceId, 'forms.write', async () => {
            throw Error('WRITE_GUARD_WAS_BYPASSED');
          }),
        ).rejects.toThrow('WORKSPACE_DELETION_PENDING');
        await expect(
          inWorkspace(tx, viewer, workspaceId, 'forms.write', async () => {
            throw Error('ROLE_GUARD_WAS_BYPASSED');
          }),
        ).rejects.toThrow('FORBIDDEN');
        await cancelDeletion(tx, owner, workspaceId, request.id, {
          expectedRevision: 1,
        });
        expect(
          (
            await tx.execute(
              sql`select * from public.scope_workspace(${owner},${workspaceId}::uuid,true)`,
            )
          ).rows,
        ).toEqual([{ role: 'owner', deletion_pending: false }]);
        expect(
          (
            await tx.execute(
              sql`select has_function_privilege('snapform_jobs','public.scope_workspace(text,uuid,boolean)','EXECUTE') as jobs_scope`,
            )
          ).rows,
        ).toEqual([{ jobs_scope: false }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      (
        await db.execute(
          sql`select nullif(current_setting('snapform.workspace_id',true),'') as workspace`,
        )
      ).rows,
    ).toEqual([{ workspace: null }]);
  } finally {
    await close();
  }
}, 30000);
