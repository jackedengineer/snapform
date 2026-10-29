import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake, mutateIntake } from '../src/intake.ts';
import {
  getEmailSettings,
  configureEmailNotifications,
} from '../src/notification-settings.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
it('opts in future notifications, snapshots a verified owner and cancels pending work without replaying old responses', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL),
    rollback = Error('Rollback notification fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID(),
          formId = crypto.randomUUID(),
          email = `${actor}@example.invalid`;
        await tx.insert(user).values({
          id: actor,
          name: 'Notification QA',
          email,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Notification QA',
          segment: 'agency',
        });
        const { definition, ids } = formFixture();
        await createForm(tx, actor, workspace.id, { id: formId, definition });
        const published = await publishForm(tx, actor, workspace.id, formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        });
        if (!published.publication) throw Error('Publication required');
        const publicId = published.publication.publicId;
        const submit = async () => {
          const id = crypto.randomUUID(),
            hash = id.replaceAll('-', '').repeat(2);
          await startIntake(tx, publicId, id, hash);
          await mutateIntake(tx, publicId, id, hash, 'submit', {
            operationId: crypto.randomUUID(),
            expectedRevision: 1,
            answers: {
              [ids.budget]: { state: 'value', value: 0 },
              [ids.contact]: { state: 'value', value: 'qa@example.invalid' },
            },
          });
          return id;
        };
        expect(await getEmailSettings(tx, actor, workspace.id, formId)).toEqual(
          { enabled: false, revision: 0 },
        );
        await submit();
        expect(
          await configureEmailNotifications(tx, actor, workspace.id, formId, {
            enabled: true,
            expectedRevision: 0,
          }),
        ).toEqual({ enabled: true, revision: 1 });
        expect(
          (
            await tx.execute(
              sql`select id from response_email_delivery where form_id=${formId}::uuid`,
            )
          ).rows,
        ).toHaveLength(0);
        const responseId = await submit();
        await getEmailSettings(tx, actor, workspace.id, formId);
        const queued = (
          await tx.execute(
            sql`select recipient_user_id,recipient_email,status,settings_revision from response_email_delivery where session_id=${responseId}::uuid`,
          )
        ).rows;
        expect(queued).toEqual([
          {
            recipient_user_id: actor,
            recipient_email: email,
            status: 'pending',
            settings_revision: 1,
          },
        ]);
        expect(
          await configureEmailNotifications(tx, actor, workspace.id, formId, {
            enabled: true,
            expectedRevision: 0,
          }),
        ).toEqual({ enabled: true, revision: 1 });
        await expect(
          configureEmailNotifications(tx, actor, workspace.id, formId, {
            enabled: false,
            expectedRevision: 0,
          }),
        ).rejects.toThrow('EMAIL_SETTINGS_CONFLICT');
        expect(
          await configureEmailNotifications(tx, actor, workspace.id, formId, {
            enabled: false,
            expectedRevision: 1,
          }),
        ).toEqual({ enabled: false, revision: 2 });
        expect(
          (
            await tx.execute(
              sql`select status,reason from response_email_delivery where session_id=${responseId}::uuid`,
            )
          ).rows,
        ).toEqual([{ status: 'cancelled', reason: 'disabled' }]);
        await configureEmailNotifications(tx, actor, workspace.id, formId, {
          enabled: true,
          expectedRevision: 2,
        });
        expect(
          (
            await tx.execute(
              sql`select status from response_email_delivery where form_id=${formId}::uuid`,
            )
          ).rows,
        ).toEqual([{ status: 'cancelled' }]);
        const viewer = crypto.randomUUID();
        await tx.insert(user).values({
          id: viewer,
          name: 'Viewer QA',
          email: `${viewer}@example.invalid`,
          emailVerified: true,
        });
        await tx.insert(membership).values({
          workspaceId: workspace.id,
          userId: viewer,
          role: 'viewer',
        });
        expect(
          (await getEmailSettings(tx, viewer, workspace.id, formId)).enabled,
        ).toBe(true);
        await expect(
          configureEmailNotifications(tx, viewer, workspace.id, formId, {
            enabled: false,
            expectedRevision: 3,
          }),
        ).rejects.toThrow('FORBIDDEN');
        await expect(
          getEmailSettings(tx, crypto.randomUUID(), workspace.id, formId),
        ).rejects.toThrow('WORKSPACE_NOT_FOUND');
        const privileges = (
          await tx.execute(
            sql`select has_table_privilege(current_user,'public.response_email_delivery','INSERT') as insert,has_table_privilege(current_user,'public.response_email_delivery','UPDATE') as update,has_table_privilege('snapform_jobs','public.user','SELECT') as job_auth_read`,
          )
        ).rows;
        expect(privileges).toEqual([
          { insert: false, update: false, job_auth_read: false },
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);
