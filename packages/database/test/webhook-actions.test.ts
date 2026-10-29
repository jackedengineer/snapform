import { expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace, inWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { saveWebhookConfiguration } from '../src/webhook-settings.ts';
import { createWebhookPreview } from '../src/webhook-preview.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
it('queues only an authorized current preview once and rejects forged membership/context and stale tuples', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL),
    rollback = Error('Rollback action fixture');
  const actor = crypto.randomUUID(),
    viewer = crypto.randomUUID();
  try {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(user).values(
          [actor, viewer].map((id) => ({
            id,
            name: 'Action QA',
            email: `${id}@example.invalid`,
            emailVerified: true,
          })),
        );
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Action QA',
          segment: 'agency',
        });
        const formId = crypto.randomUUID(),
          configurationId = crypto.randomUUID(),
          master = Buffer.alloc(32, 7).toString('base64');
        await createForm(tx, actor, workspace.id, {
          id: formId,
          definition: formFixture().definition,
        });
        await publishForm(tx, actor, workspace.id, formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        });
        await saveWebhookConfiguration(
          tx,
          actor,
          workspace.id,
          formId,
          {
            configurationId,
            expectedRevision: 0,
            url: 'https://hooks.example.com/actions',
          },
          master,
        );
        const preview = await createWebhookPreview(
          tx,
          actor,
          workspace.id,
          formId,
          {
            deliveryId: crypto.randomUUID(),
            configurationId,
            expectedRevision: 1,
          },
          master,
        );
        await inWorkspace(
          tx,
          actor,
          workspace.id,
          'integrations.manage',
          async (scoped) => {
            const queue = async (
              revision: number | null = 1,
              attempts: number | null = 0,
              unknown: boolean | null = false,
              configuration = configurationId,
              requestedWorkspace = workspace.id,
            ) =>
              (
                await scoped.execute<{ queued: boolean }>(
                  sql`select public.queue_webhook(${requestedWorkspace}::uuid,${formId}::uuid,${preview.id}::uuid,${configuration}::uuid,${revision}::integer,${attempts}::integer,${unknown}::boolean) as queued`,
                )
              ).rows[0].queued;
            await scoped.execute(
              sql`insert into public.membership(workspace_id,user_id,role) values(${workspace.id}::uuid,${viewer},'viewer')`,
            );
            await scoped.execute(
              sql`select set_config('snapform.user_id',${viewer},true),set_config('snapform.role','owner',true)`,
            );
            expect(await queue()).toBe(false);
            await scoped.execute(
              sql`select set_config('snapform.user_id',${actor},true)`,
            );
            for (const [revision, attempts, unknown] of [
              [2, 0, false],
              [null, 0, false],
              [1, null, false],
              [1, 0, null],
              [1, 1, false],
            ] as const)
              expect(await queue(revision, attempts, unknown)).toBe(false);
            expect(await queue(1, 0, false, crypto.randomUUID())).toBe(false);
            expect(
              await queue(1, 0, false, configurationId, crypto.randomUUID()),
            ).toBe(false);
            expect(await queue()).toBe(true);
            expect(await queue()).toBe(false);
            expect(
              (
                await scoped.execute(
                  sql`select status,attempts,payload from public.webhook_delivery where id=${preview.id}::uuid`,
                )
              ).rows,
            ).toEqual([
              { status: 'pending', attempts: 0, payload: preview.payload },
            ]);
          },
        );
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      await db.select({ id: user.id }).from(user).where(eq(user.id, actor)),
    ).toHaveLength(0);
  } finally {
    await close();
  }
}, 30000);
