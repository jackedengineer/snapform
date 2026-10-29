import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';

it('starts webhook configurations disabled and prevents unverified enablement', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback webhook settings fixture');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID(),
          formId = crypto.randomUUID(),
          configurationId = crypto.randomUUID();
        await tx.insert(user).values({
          id: actor,
          name: 'Webhook QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Webhook QA',
          segment: 'agency',
        });
        await createForm(tx, actor, workspace.id, {
          id: formId,
          definition: formFixture().definition,
        });
        await tx.execute(
          sql`insert into public.webhook_configuration(id,workspace_id,form_id,sealed_destination,created_by) values(${configurationId}::uuid,${workspace.id}::uuid,${formId}::uuid,${'v1.' + 'A'.repeat(80)},${actor})`,
        );
        await tx.execute(
          sql`insert into public.form_webhook_settings(workspace_id,form_id,configuration_id,updated_by) values(${workspace.id}::uuid,${formId}::uuid,${configurationId}::uuid,${actor})`,
        );
        expect(
          (
            await tx.execute(
              sql`select enabled,revision from public.form_webhook_settings where form_id=${formId}::uuid`,
            )
          ).rows,
        ).toEqual([{ enabled: false, revision: 1 }]);
        await expect(
          tx.transaction(async (guard) => {
            await guard.execute(
              sql`update public.form_webhook_settings set enabled=true where form_id=${formId}::uuid`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: '23514' } });
        await expect(
          tx.transaction(async (guard) => {
            await guard.execute(
              sql`update public.webhook_configuration set sealed_destination=${'v1.' + 'B'.repeat(80)} where id=${configurationId}::uuid`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: '42501' } });
        await expect(
          tx.transaction(async (guard) => {
            await guard.execute(
              sql`insert into public.webhook_configuration(id,workspace_id,form_id,sealed_destination,created_by,verified_at) values(${crypto.randomUUID()}::uuid,${workspace.id}::uuid,${formId}::uuid,${'v1.' + 'A'.repeat(80)},${actor},now())`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: '42501' } });
        const otherForm = crypto.randomUUID();
        await createForm(tx, actor, workspace.id, {
          id: otherForm,
          definition: formFixture().definition,
        });
        await expect(
          tx.transaction(async (guard) => {
            await guard.execute(
              sql`insert into public.form_webhook_settings(workspace_id,form_id,configuration_id,updated_by) values(${workspace.id}::uuid,${otherForm}::uuid,${configurationId}::uuid,${actor})`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: '23503' } });
        expect(
          (
            await tx.execute(
              sql`select has_table_privilege(current_user,'public.webhook_configuration','UPDATE') as mutate,has_table_privilege(current_user,'public.webhook_configuration','DELETE') as remove,has_table_privilege('snapform_jobs','public.webhook_configuration','SELECT') as job_read`,
            )
          ).rows,
        ).toEqual([{ mutate: false, remove: false, job_read: false }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);
