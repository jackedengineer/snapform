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
it('previews only synthetic published data, reuses the operation, and never queues or creates a response', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback preview fixture'),
    actor = crypto.randomUUID();
  try {
    await expect(
      db.transaction(async (tx) => {
        expect(
          (await tx.execute(sql`select current_user as actor`)).rows,
        ).toEqual([{ actor: 'snapform_runtime' }]);
        await tx.insert(user).values({
          id: actor,
          name: 'Preview QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Preview QA',
          segment: 'agency',
        });
        const formId = crypto.randomUUID(),
          configurationId = crypto.randomUUID(),
          master = Buffer.alloc(32, 7).toString('base64');
        await createForm(tx, actor, workspace.id, {
          id: formId,
          definition: formFixture().definition,
        });
        await saveWebhookConfiguration(
          tx,
          actor,
          workspace.id,
          formId,
          {
            configurationId,
            expectedRevision: 0,
            url: 'https://hooks.example.com/preview',
          },
          master,
        );
        const input = {
          deliveryId: crypto.randomUUID(),
          configurationId,
          expectedRevision: 1,
        };
        await expect(
          createWebhookPreview(tx, actor, workspace.id, formId, input, master),
        ).rejects.toThrow('PUBLICATION_REQUIRED');
        const publication = await publishForm(tx, actor, workspace.id, formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        });
        const first = await createWebhookPreview(
          tx,
          actor,
          workspace.id,
          formId,
          input,
          master,
        );
        expect(first.id).toBe(input.deliveryId);
        expect(first.url).toBe('https://hooks.example.com/preview');
        expect(first.status).toBe('preview');
        expect(JSON.parse(first.payload)).toMatchObject({
          test: true,
          type: 'webhook.test',
          data: { formVersionId: publication.versionId },
        });
        expect(
          await createWebhookPreview(
            tx,
            actor,
            workspace.id,
            formId,
            input,
            master,
          ),
        ).toEqual(first);
        for (const changed of [
          { ...input, expectedRevision: 2 },
          { ...input, configurationId: crypto.randomUUID() },
        ])
          await expect(
            createWebhookPreview(
              tx,
              actor,
              workspace.id,
              formId,
              changed,
              master,
            ),
          ).rejects.toThrow('WEBHOOK_SETTINGS_CONFLICT');
        await expect(
          createWebhookPreview(
            tx,
            crypto.randomUUID(),
            workspace.id,
            formId,
            input,
            master,
          ),
        ).rejects.toThrow('WORKSPACE_NOT_FOUND');
        await expect(
          createWebhookPreview(
            tx,
            actor,
            workspace.id,
            formId,
            { ...input, payload: 'forged' },
            master,
          ),
        ).rejects.toThrow();
        await inWorkspace(
          tx,
          actor,
          workspace.id,
          'integrations.manage',
          async (scoped) => {
            expect(
              (
                await scoped.execute(
                  sql`select status,attempts from public.webhook_delivery where form_id=${formId}::uuid`,
                )
              ).rows,
            ).toEqual([{ status: 'preview', attempts: 0 }]);
            expect(
              (
                await scoped.execute(
                  sql`select count(*)::integer as count from public.response_session where form_id=${formId}::uuid`,
                )
              ).rows,
            ).toEqual([{ count: 0 }]);
            expect(
              (
                await scoped.execute(
                  sql`select count(*)::integer as count from public.response_outbox where form_id=${formId}::uuid`,
                )
              ).rows,
            ).toEqual([{ count: 0 }]);
          },
        );
        expect(Object.keys(first).sort()).toEqual([
          'configurationId',
          'createdAt',
          'id',
          'payload',
          'status',
          'url',
          'version',
          'versionId',
        ]);
        const nextConfiguration = crypto.randomUUID();
        await saveWebhookConfiguration(
          tx,
          actor,
          workspace.id,
          formId,
          {
            configurationId: nextConfiguration,
            expectedRevision: 1,
            url: 'https://hooks.example.com/replaced',
          },
          master,
        );
        await expect(
          createWebhookPreview(
            tx,
            actor,
            workspace.id,
            formId,
            {
              ...input,
              configurationId: nextConfiguration,
              expectedRevision: 2,
            },
            master,
          ),
        ).rejects.toThrow('OPERATION_CONFLICT');
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
